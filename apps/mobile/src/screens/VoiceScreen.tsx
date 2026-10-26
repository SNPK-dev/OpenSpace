import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChannelsStackParams } from '../navigation/RootNavigator'
import { Room as LiveKitRoom, RoomEvent } from 'livekit-client'
import { api } from '../api/client'
import { useWSEvent } from '../context/WSContext'
import type { Participant, VoiceJoinedEvent, VoiceLeftEvent, VoiceStateChangedEvent } from '../api/types'
import { colors, fonts, radius } from '../theme'

type Props = NativeStackScreenProps<ChannelsStackParams, 'Voice'>

const HEARTBEAT_INTERVAL = 20_000

export default function VoiceScreen({ route, navigation }: Props) {
  const { channelId } = route.params
  const [participants, setParticipants] = useState<Participant[]>([])
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const lkRoomRef = useRef<LiveKitRoom | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }, [])

  const startHeartbeat = useCallback((id: string) => {
    stopHeartbeat()
    heartbeatRef.current = setInterval(() => {
      void api.voice.heartbeat(id).catch(() => {})
    }, HEARTBEAT_INTERVAL)
  }, [stopHeartbeat])

  useEffect(() => {
    void api.voice.participants(channelId).then(r => setParticipants(r.participants)).catch(() => {})
    return () => {
      stopHeartbeat()
      lkRoomRef.current?.disconnect()
      void api.voice.leave(channelId).catch(() => {})
    }
  }, [channelId, stopHeartbeat])

  useWSEvent<VoiceJoinedEvent>('voice.joined', (e) => {
    if (e.channel_id !== channelId) return
    setParticipants(prev => prev.find(p => p.id === e.participant.id) ? prev : [...prev, e.participant])
  })

  useWSEvent<VoiceLeftEvent>('voice.left', (e) => {
    if (e.channel_id !== channelId) return
    setParticipants(prev => prev.filter(p => p.id !== e.identity_id))
  })

  useWSEvent<VoiceStateChangedEvent>('voice.state_changed', (e) => {
    if (e.channel_id !== channelId) return
    setParticipants(prev => prev.map(p => p.id === e.participant.id ? e.participant : p))
  })

  async function joinVoice() {
    setConnecting(true)
    try {
      const joinRes = await api.voice.join(channelId)
      setParticipants(joinRes.participants)

      const [iceRes, tokenRes] = await Promise.all([
        api.voice.iceServers(),
        api.voice.token(channelId, ['camera', 'microphone']),
      ])

      const lkRoom = new LiveKitRoom({ adaptiveStream: true, dynacast: true })
      lkRoomRef.current = lkRoom
      lkRoom.on(RoomEvent.Disconnected, () => { setJoined(false); stopHeartbeat() })

      await lkRoom.connect(tokenRes.livekit_url, tokenRes.token, {
        rtcConfig: { iceServers: iceRes.ice_servers },
      })

      setJoined(true)
      setMuted(joinRes.participant.muted)
      setCameraOn(joinRes.participant.camera_enabled)
      startHeartbeat(channelId)
    } catch (err) {
      console.error('voice join error', err)
    } finally {
      setConnecting(false)
    }
  }

  async function leaveVoice() {
    stopHeartbeat()
    lkRoomRef.current?.disconnect()
    lkRoomRef.current = null
    await api.voice.leave(channelId).catch(() => {})
    setJoined(false)
    navigation.goBack()
  }

  async function toggleMute() {
    const next = !muted
    setMuted(next)
    const lp = lkRoomRef.current?.localParticipant
    await lp?.setMicrophoneEnabled(!next)
    await api.voice.updateState(channelId, { muted: next }).catch(() => {})
  }

  async function toggleCamera() {
    const next = !cameraOn
    setCameraOn(next)
    const lp = lkRoomRef.current?.localParticipant
    await lp?.setCameraEnabled(next)
    await api.voice.updateState(channelId, { camera_enabled: next }).catch(() => {})
  }

  function renderParticipant({ item }: { item: Participant }) {
    return (
      <View style={s.tile}>
        <View style={s.tileAvatar}>
          <Text style={s.tileAvatarText}>{(item.display_name || item.username)[0]?.toUpperCase()}</Text>
        </View>
        <Text style={s.tileName}>{item.display_name || item.username}</Text>
        <View style={s.tileIcons}>
          {item.muted ? <Text>🔇</Text> : null}
          {item.camera_enabled ? <Text>📹</Text> : null}
        </View>
      </View>
    )
  }

  return (
    <View style={s.flex}>
      <FlatList
        style={s.list}
        data={participants}
        keyExtractor={p => p.id}
        renderItem={renderParticipant}
        numColumns={2}
        ListEmptyComponent={<Text style={s.empty}>No one in this channel yet</Text>}
        contentContainerStyle={s.grid}
      />

      <View style={s.controls}>
        {!joined ? (
          <TouchableOpacity style={s.joinBtn} onPress={() => { void joinVoice() }} disabled={connecting}>
            {connecting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.joinBtnText}>📞 Join Voice</Text>
            }
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={[s.ctrlBtn, muted && s.ctrlBtnActive]} onPress={() => { void toggleMute() }}>
              <Text style={s.ctrlBtnText}>{muted ? '🔇' : '🎤'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctrlBtn, cameraOn && s.ctrlBtnActive]} onPress={() => { void toggleCamera() }}>
              <Text style={s.ctrlBtnText}>{cameraOn ? '📹' : '📷'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ctrlBtn, s.ctrlBtnLeave]} onPress={() => { void leaveVoice() }}>
              <Text style={s.ctrlBtnText}>📵 Leave</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  grid: { padding: 12, gap: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 32 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, margin: 4, alignItems: 'center', gap: 8 },
  tileAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  tileAvatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.lg },
  tileName: { fontSize: fonts.sm, fontWeight: '600', color: colors.text },
  tileIcons: { flexDirection: 'row', gap: 4 },
  controls: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' },
  joinBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.sm, padding: 14, alignItems: 'center' },
  joinBtnText: { color: '#fff', fontWeight: '600', fontSize: fonts.base },
  ctrlBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 12, alignItems: 'center' },
  ctrlBtnActive: { backgroundColor: colors.danger },
  ctrlBtnLeave: { backgroundColor: colors.danger },
  ctrlBtnText: { fontSize: fonts.base, color: colors.text },
})
