import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Mic } from 'lucide-react'
import {
  Room as LiveKitRoom, RoomEvent, Track,
  LocalTrackPublication, LocalAudioTrack, LocalVideoTrack,
} from 'livekit-client'
import { api, ApiError } from '../api/client'
import { useWS, useWSEvent } from '../context/WSContext'
import ScreenSourcePicker from '../components/ScreenSourcePicker'
import type {
  Identity, Channel, Participant,
  VoiceJoinedEvent, VoiceLeftEvent, VoiceStateChangedEvent,
} from '../api/types'

interface Props {
  channel: Channel
  autoJoinToken?: number
  persistOnUnmount?: boolean
  onJoined?: (channel: Channel) => void
  onLeft?: (channelId: string) => void
  onLeaveReady?: (leave: (() => Promise<void>) | null) => void
}

const HEARTBEAT_INTERVAL = 20_000
const VOICE_SESSION_KEY  = 'openspace:voice-channel'
const VOICE_MUTED_KEY    = 'openspace:voice-muted'
const VOICE_DEAFENED_KEY = 'openspace:voice-deafened'

type ActiveVoiceWindow = Window & typeof globalThis & {
  __openspaceLeaveActiveVoice?: () => Promise<void>
}

type RemoteVideoItem = { key: string; identity: string; el: HTMLVideoElement }

function matchesLiveKitIdentity(liveKitIdentity: string, identityId: string): boolean {
  return liveKitIdentity === identityId || liveKitIdentity.startsWith(identityId + '-')
}

export default function VoicePane({
  channel,
  autoJoinToken = 0,
  persistOnUnmount = false,
  onJoined,
  onLeft,
  onLeaveReady,
}: Props) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  useEffect(() => { void api.me.get().then(setIdentity).catch(() => null) }, [])
  const { connected } = useWS()

  const [participants,   setParticipants]   = useState<Participant[]>([])
  const [joined,         setJoined]         = useState(false)
  const [muted,          setMuted]          = useState(false)
  const [deafened,       setDeafened]       = useState(false)
  const [cameraOn,       setCameraOn]       = useState(false)
  const [screenSharing,  setScreenSharing]  = useState(false)
  const [hasLocalCamera,      setHasLocalCamera]      = useState(false)
  const [hasLocalScreen,      setHasLocalScreen]      = useState(false)
  const [localScreenExpanded, setLocalScreenExpanded] = useState(true)
  const [streamViewExpanded,  setStreamViewExpanded]  = useState(true)
  const [connecting,          setConnecting]          = useState(false)
  const [reconnecting,   setReconnecting]   = useState(
    () => sessionStorage.getItem(VOICE_SESSION_KEY) === channel.id
  )
  const [rejoinPending,  setRejoinPending]  = useState(false)

  // Screen source picker state
  const [showPicker,    setShowPicker]    = useState(false)
  const [pickerSources, setPickerSources] = useState<ScreenSource[]>([])
  // Active remote screen share video elements (for React rendering)
  const [remoteScreenShares, setRemoteScreenShares] = useState<RemoteVideoItem[]>([])
  const [remoteCameras, setRemoteCameras] = useState<RemoteVideoItem[]>([])

  type VideoQualityStats = { w: number; h: number; fps: number }
  const ssQualityRef  = useRef<Map<string, { frames: number; since: number; stats: VideoQualityStats }>>(new Map())
  const [ssQuality, setSsQuality] = useState<Map<string, VideoQualityStats>>(new Map())

  const lkRoomRef        = useRef<LiveKitRoom | null>(null)
  const heartbeatRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioElsRef      = useRef<Map<string, HTMLAudioElement>>(new Map())
  const screenShareVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const cameraVideosRef      = useRef<Map<string, HTMLVideoElement>>(new Map())
  const localCameraElRef     = useRef<HTMLVideoElement | null>(null)
  const localScreenElRef     = useRef<HTMLVideoElement | null>(null)
  const localScreenTrackRef      = useRef<LocalVideoTrack | null>(null)
  const localScreenAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  const mutedSenderTracksRef = useRef<Array<{ sender: RTCRtpSender; track: MediaStreamTrack }>>([])

  const joinedRef        = useRef(false)
  const mutedRef         = useRef(false)
  const deafenedRef      = useRef(false)
  const reconnectingRef  = useRef(reconnecting)
  const prevConnectedRef = useRef(connected)
  const persistOnUnmountRef = useRef(persistOnUnmount)
  const autoJoinTokenRef = useRef(autoJoinToken)

  useEffect(() => { joinedRef.current       = joined      }, [joined])
  useEffect(() => { reconnectingRef.current = reconnecting }, [reconnecting])
  useEffect(() => { persistOnUnmountRef.current = persistOnUnmount }, [persistOnUnmount])

  useEffect(() => {
    if (!joined) return
    sessionStorage.setItem(VOICE_MUTED_KEY, String(muted))
  }, [joined, muted])
  useEffect(() => {
    if (!joined) return
    sessionStorage.setItem(VOICE_DEAFENED_KEY, String(deafened))
  }, [joined, deafened])
  useEffect(() => {
    if (joined) {
      sessionStorage.setItem(VOICE_SESSION_KEY, channel.id)
    } else if (!reconnecting) {
      sessionStorage.removeItem(VOICE_SESSION_KEY)
    }
  }, [joined, reconnecting, channel.id])

  // ─── LiveKit helpers ────────────────────────────────────────────────────────

  const setPublisherAudioSendersMuted = useCallback(async (shouldMute: boolean): Promise<boolean> => {
    const room = lkRoomRef.current as unknown as {
      engine?: { pcManager?: { publisher?: { getSenders?: () => RTCRtpSender[] } } }
    } | null
    const senders = room?.engine?.pcManager?.publisher?.getSenders?.() ?? []
    let touched = false

    if (shouldMute) {
      for (const sender of senders) {
        const track = sender.track
        if (track?.kind !== 'audio') continue
        touched = true
        track.enabled = false
        if (!mutedSenderTracksRef.current.some(item => item.sender === sender)) {
          mutedSenderTracksRef.current.push({ sender, track })
        }
        await sender.replaceTrack(null).catch(err => {
          console.warn('[voice] fallback sender mute failed:', err)
        })
      }
      return touched
    }

    for (const item of mutedSenderTracksRef.current) {
      touched = true
      item.track.enabled = true
      if (!item.sender.track || item.sender.track.readyState !== 'live') {
        await item.sender.replaceTrack(item.track).catch(err => {
          console.warn('[voice] fallback sender unmute failed:', err)
        })
      }
    }
    mutedSenderTracksRef.current = []
    return touched
  }, [])

  const applyMuteToLK = useCallback(async (shouldMute: boolean): Promise<boolean> => {
    const lp = lkRoomRef.current?.localParticipant
    if (!lp) { return false }
    const micPub = lp.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined
    const fallbackApplied = await setPublisherAudioSendersMuted(shouldMute)
    if (!micPub?.track) { return fallbackApplied }
    const localTrack = micPub.track as LocalAudioTrack
    if (shouldMute) {
      await localTrack.mute()
      await localTrack.pauseUpstream().catch(err => {
        console.warn('[voice] pause upstream failed:', err)
      })
    } else {
      await localTrack.unmute()
      await localTrack.resumeUpstream().catch(err => {
        console.warn('[voice] resume upstream failed:', err)
      })
    }
    const mst = micPub.track.mediaStreamTrack
    mst.enabled = !shouldMute
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as unknown as { __lkMicTrack?: MediaStreamTrack }).__lkMicTrack = mst
    }
    return true
  }, [setPublisherAudioSendersMuted])

  const cleanupAudio = useCallback(() => {
    audioElsRef.current.forEach(el => { el.pause(); el.remove() })
    audioElsRef.current.clear()
  }, [])

  const startQualityMonitor = useCallback((key: string, el: HTMLVideoElement) => {
    ssQualityRef.current.set(key, { frames: 0, since: performance.now(), stats: { w: 0, h: 0, fps: 0 } })
    const tick = () => {
      const entry = ssQualityRef.current.get(key)
      if (!entry) return
      entry.frames++
      const now = performance.now()
      if (now - entry.since >= 500) {
        const fps = Math.round(entry.frames / ((now - entry.since) / 1000))
        entry.stats = { w: el.videoWidth, h: el.videoHeight, fps }
        entry.frames = 0
        entry.since = now
        setSsQuality(prev => new Map(prev).set(key, entry.stats))
      }
      if ('requestVideoFrameCallback' in el) {
        el.requestVideoFrameCallback(tick)
      } else {
        requestAnimationFrame(tick)
      }
    }
    if ('requestVideoFrameCallback' in el) {
      el.requestVideoFrameCallback(tick)
    } else {
      requestAnimationFrame(tick)
    }
  }, [])

  const cleanupScreenShareVideos = useCallback(() => {
    screenShareVideosRef.current.forEach(el => { el.pause(); el.remove() })
    screenShareVideosRef.current.clear()
    ssQualityRef.current.clear()
    setSsQuality(new Map())
    setRemoteScreenShares([])
  }, [])

  const cleanupLocalCameraPreview = useCallback((stopTracks = false) => {
    const el = localCameraElRef.current
    if (!el) {
      setHasLocalCamera(false)
      return
    }
    const stream = el.srcObject instanceof MediaStream ? el.srcObject : null
    if (stopTracks) stream?.getTracks().forEach(track => track.stop())
    el.srcObject = null
    el.remove()
    localCameraElRef.current = null
    setHasLocalCamera(false)
  }, [])

  const cleanupLocalScreenPreview = useCallback(() => {
    const el = localScreenElRef.current
    if (el) {
      el.pause()
      el.srcObject = null
      el.remove()
      localScreenElRef.current = null
    }
    setHasLocalScreen(false)
  }, [])

  const setupLocalScreenPreview = useCallback((videoTrack: MediaStreamTrack) => {
    cleanupLocalScreenPreview()
    const el = document.createElement('video')
    el.srcObject = new MediaStream([videoTrack])
    el.autoplay = true
    el.playsInline = true
    el.muted = true
    document.body.appendChild(el)
    localScreenElRef.current = el
    setHasLocalScreen(true)
    setLocalScreenExpanded(true)
  }, [cleanupLocalScreenPreview])

  const cleanupCameraVideos = useCallback(() => {
    cameraVideosRef.current.forEach(el => { el.pause(); el.remove() })
    cameraVideosRef.current.clear()
    setRemoteCameras([])
    cleanupLocalCameraPreview(true)
  }, [cleanupLocalCameraPreview])

  const removeRemoteScreenSharesForIdentity = useCallback((identityId: string) => {
    setRemoteScreenShares(prev => prev.filter(item => {
      if (!matchesLiveKitIdentity(item.identity, identityId)) return true
      const el = screenShareVideosRef.current.get(item.key) ?? item.el
      el.pause(); el.remove()
      screenShareVideosRef.current.delete(item.key)
      ssQualityRef.current.delete(item.key)
      setSsQuality(prev2 => { const m = new Map(prev2); m.delete(item.key); return m })
      return false
    }))
  }, [])

  const removeRemoteCamerasForIdentity = useCallback((identityId: string) => {
    setRemoteCameras(prev => prev.filter(item => {
      if (!matchesLiveKitIdentity(item.identity, identityId)) return true
      const el = cameraVideosRef.current.get(item.key) ?? item.el
      el.pause(); el.remove()
      cameraVideosRef.current.delete(item.key)
      return false
    }))
  }, [])

  const stopLocalScreenShare = useCallback(async () => {
    cleanupLocalScreenPreview()
    const lp = lkRoomRef.current?.localParticipant
    const localTrack = localScreenTrackRef.current
    localScreenTrackRef.current = null
    const localAudioTrack = localScreenAudioTrackRef.current
    localScreenAudioTrackRef.current = null
    if (localTrack) {
      if (lp) {
        await lp.unpublishTrack(localTrack).catch(err => {
          console.warn('[voice] stopLocalScreenShare unpublish video error:', err)
        })
      }
      localTrack.mediaStreamTrack.stop()
    } else if (lp) {
      // Fallback: may have been published via setScreenShareEnabled
      await lp.setScreenShareEnabled(false).catch(() => {})
    }
    if (localAudioTrack) {
      if (lp) {
        await lp.unpublishTrack(localAudioTrack).catch(err => {
          console.warn('[voice] stopLocalScreenShare unpublish audio error:', err)
        })
      }
      localAudioTrack.mediaStreamTrack.stop()
    }
  }, [cleanupLocalScreenPreview])

  const disconnectLiveKit = useCallback(() => {
    lkRoomRef.current?.disconnect()
    lkRoomRef.current = null
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__lkRoom = null
    }
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }, [])

  const startHeartbeat = useCallback((channelId: string) => {
    stopHeartbeat()
    heartbeatRef.current = setInterval(async () => {
      try {
        await api.voice.heartbeat(channelId)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'not_in_room') {
          sessionStorage.setItem(VOICE_MUTED_KEY, String(mutedRef.current))
          sessionStorage.setItem(VOICE_DEAFENED_KEY, String(deafenedRef.current))
          stopHeartbeat()
          await stopLocalScreenShare()
          await lkRoomRef.current?.localParticipant?.setCameraEnabled(false).catch(() => {})
          cleanupAudio()
          cleanupScreenShareVideos()
          cleanupCameraVideos()
          disconnectLiveKit()
          joinedRef.current   = false
          mutedRef.current    = false
          deafenedRef.current = false
          setJoined(false)
          setMuted(false); setDeafened(false); setCameraOn(false); setScreenSharing(false)
          reconnectingRef.current = true
          setReconnecting(true)
          setRejoinPending(true)
        }
      }
    }, HEARTBEAT_INTERVAL)
  }, [stopHeartbeat, stopLocalScreenShare, cleanupAudio, cleanupScreenShareVideos, cleanupCameraVideos, disconnectLiveKit, setRejoinPending])

  // ─── Connectivity effects ────────────────────────────────────────────────────

  useEffect(() => {
    if (connected) {
      void api.voice.participants(channel.id).then(r => setParticipants(r.participants)).catch(() => {})
    }
  }, [connected, channel.id])

  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (!connected && wasConnected && joinedRef.current) {
      sessionStorage.setItem(VOICE_MUTED_KEY,   String(mutedRef.current))
      sessionStorage.setItem(VOICE_DEAFENED_KEY, String(deafenedRef.current))
      void stopLocalScreenShare().catch(() => {})
      void lkRoomRef.current?.localParticipant?.setCameraEnabled(false).catch(() => {})
      stopHeartbeat(); cleanupAudio(); cleanupScreenShareVideos(); cleanupCameraVideos(); disconnectLiveKit()
      setJoined(false)
      setMuted(false); setDeafened(false); setCameraOn(false); setScreenSharing(false)
      setReconnecting(true)
    }
  }, [connected, stopHeartbeat, stopLocalScreenShare, cleanupAudio, cleanupScreenShareVideos, cleanupCameraVideos, disconnectLiveKit])

  useEffect(() => {
    if (!connected) return
    if (!reconnectingRef.current && !rejoinPending) return
    reconnectingRef.current = false
    setReconnecting(false)
    setRejoinPending(false)
    void joinVoice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, rejoinPending])

  useEffect(() => {
    return () => {
      onLeaveReady?.(null)
      if (joinedRef.current && !persistOnUnmountRef.current) void leaveVoice()
      else sessionStorage.removeItem(VOICE_SESSION_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])

  useEffect(() => {
    if (autoJoinToken <= 0 || autoJoinTokenRef.current === autoJoinToken) return
    autoJoinTokenRef.current = autoJoinToken
    if (!joinedRef.current && !connecting && !reconnecting) void joinVoice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoinToken, channel.id, connecting, reconnecting])

  // ─── WS voice events ─────────────────────────────────────────────────────────

  useWSEvent<VoiceJoinedEvent>('voice.joined', (e) => {
    if (e.channel_id !== channel.id) return
    setParticipants(prev =>
      prev.find(p => p.id === e.participant.id) ? prev : [...prev, e.participant]
    )
  })

  useWSEvent<VoiceLeftEvent>('voice.left', (e) => {
    if (e.channel_id !== channel.id) return
    if (e.identity_id === identity?.id && joinedRef.current) return
    setParticipants(prev => prev.filter(p => p.id !== e.identity_id))
  })

  useWSEvent<VoiceStateChangedEvent>('voice.state_changed', (e) => {
    if (e.channel_id !== channel.id) return
    setParticipants(prev => prev.map(p => p.id === e.participant.id ? e.participant : p))
    if (!e.participant.screen_sharing) removeRemoteScreenSharesForIdentity(e.participant.id)
    if (!e.participant.camera_enabled) removeRemoteCamerasForIdentity(e.participant.id)
    const lkRoom = lkRoomRef.current
    if (!lkRoom || e.participant.id === identity?.id) return
    const remoteParticipant = Array.from(lkRoom.remoteParticipants.values())
      .find(p => matchesLiveKitIdentity(p.identity, e.participant.id))
    if (!remoteParticipant) return
    for (const pub of remoteParticipant.trackPublications.values()) {
      const key = `${remoteParticipant.sid}-${pub.trackSid}`
      const el = audioElsRef.current.get(key)
      if (!el) continue
      el.muted = deafenedRef.current || e.participant.muted
      if (e.participant.muted) {
        el.pause()
      } else if (!deafenedRef.current) {
        void el.play().catch(() => {})
      }
    }
  })

  // ─── Core actions ─────────────────────────────────────────────────────────────

  async function joinVoice() {
    setConnecting(true)

    const storedCh        = sessionStorage.getItem(VOICE_SESSION_KEY)
    const desiredMuted    = storedCh === channel.id && sessionStorage.getItem(VOICE_MUTED_KEY)   === 'true'
    const desiredDeafened = storedCh === channel.id && sessionStorage.getItem(VOICE_DEAFENED_KEY) === 'true'

    try {
      const joinRes = await api.voice.join(channel.id)
      setParticipants(joinRes.participants)
      setJoined(true)
      onJoined?.(channel)
      onLeaveReady?.(() => leaveVoice())
      ;(window as ActiveVoiceWindow).__openspaceLeaveActiveVoice = () => leaveVoice()

      mutedRef.current    = desiredMuted
      deafenedRef.current = desiredDeafened
      setMuted(desiredMuted)
      setDeafened(desiredDeafened)
      setCameraOn(joinRes.participant.camera_enabled)
      setScreenSharing(joinRes.participant.screen_sharing)
      startHeartbeat(channel.id)

      if (desiredMuted || desiredDeafened) {
        void api.voice.updateState(channel.id, { muted: desiredMuted, deafened: desiredDeafened }).catch(() => {})
      }

      void (async () => {
        const myIdentityId = identity?.id ?? ''

        try {
          const [iceRes, tokenRes] = await Promise.all([
            api.voice.iceServers(),
            api.voice.token(channel.id, ['camera', 'microphone', 'screen_share']),
          ])

          const lkRoom = new LiveKitRoom({ adaptiveStream: false, dynacast: true })
          lkRoomRef.current = lkRoom
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(window as any).__lkRoom = lkRoom
          }

          lkRoom.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
            const source = pub.source ?? track.source
            const key = `${participant.sid}-${pub.trackSid || track.sid}`
            if (track.kind === Track.Kind.Audio) {
              if (myIdentityId && participant.identity.startsWith(myIdentityId + '-')) {
                console.debug('[voice] skipping self-audio from other session:', participant.identity)
                return
              }
              const el = track.attach() as HTMLAudioElement
              el.muted = deafenedRef.current
              document.body.appendChild(el)
              audioElsRef.current.set(key, el)
            } else if (track.kind === Track.Kind.Video && source === Track.Source.ScreenShare) {
              if (screenShareVideosRef.current.has(key)) return
              const el = track.attach() as HTMLVideoElement
              el.autoplay = true
              el.playsInline = true
              el.style.maxWidth = '100%'
              document.body.appendChild(el)
              screenShareVideosRef.current.set(key, el)
              setRemoteScreenShares(prev => [...prev, { key, identity: participant.identity, el }])
              startQualityMonitor(key, el)
            } else if (track.kind === Track.Kind.Video && source === Track.Source.Camera) {
              if (cameraVideosRef.current.has(key)) return
              const el = track.attach() as HTMLVideoElement
              el.autoplay = true
              el.playsInline = true
              el.style.maxWidth = '100%'
              document.body.appendChild(el)
              cameraVideosRef.current.set(key, el)
              setRemoteCameras(prev => [...prev, { key, identity: participant.identity, el }])
            }
          })

          lkRoom.on(RoomEvent.TrackPublished, (pub) => {
            if (pub.kind === Track.Kind.Video &&
                (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.Camera)) {
              pub.setSubscribed(true)
            } else if (pub.source === Track.Source.ScreenShareAudio) {
              pub.setSubscribed(true)
            }
          })

          lkRoom.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
            const source = pub.source ?? track.source
            const key = `${participant.sid}-${pub.trackSid || track.sid}`
            if (track.kind === Track.Kind.Audio) {
              const el = audioElsRef.current.get(key)
              if (el) { el.pause(); el.remove(); audioElsRef.current.delete(key) }
              track.detach()
            } else if (track.kind === Track.Kind.Video && source === Track.Source.ScreenShare) {
              const el = screenShareVideosRef.current.get(key)
              if (el) { el.pause(); el.remove(); screenShareVideosRef.current.delete(key) }
              track.detach()
              ssQualityRef.current.delete(key)
              setSsQuality(prev => { const m = new Map(prev); m.delete(key); return m })
              setRemoteScreenShares(prev => prev.filter(s => s.key !== key))
            } else if (track.kind === Track.Kind.Video && source === Track.Source.Camera) {
              const el = cameraVideosRef.current.get(key)
              if (el) { el.pause(); el.remove(); cameraVideosRef.current.delete(key) }
              track.detach()
              setRemoteCameras(prev => prev.filter(c => c.key !== key))
            }
          })

          lkRoom.on(RoomEvent.TrackUnpublished, (pub, participant) => {
            const key = `${participant.sid}-${pub.trackSid}`
            if (pub.source === Track.Source.ScreenShare) {
              const el = screenShareVideosRef.current.get(key)
              if (el) { el.pause(); el.remove(); screenShareVideosRef.current.delete(key) }
              ssQualityRef.current.delete(key)
              setSsQuality(prev => { const m = new Map(prev); m.delete(key); return m })
              setRemoteScreenShares(prev => prev.filter(s => s.key !== key))
            } else if (pub.source === Track.Source.Camera) {
              const el = cameraVideosRef.current.get(key)
              if (el) { el.pause(); el.remove(); cameraVideosRef.current.delete(key) }
              setRemoteCameras(prev => prev.filter(c => c.key !== key))
            }
          })

          lkRoom.on(RoomEvent.Reconnected, () => {
            console.debug('[voice] LK reconnected — re-applying mute:', mutedRef.current)
            void applyMuteToLK(mutedRef.current)
            if (deafenedRef.current) audioElsRef.current.forEach(el => { el.muted = true })
          })

          lkRoom.on(RoomEvent.LocalTrackPublished, (pub) => { void (async () => {
            if (pub.source === Track.Source.ScreenShare) {
              const sender = (pub.track as LocalVideoTrack | undefined)?.sender
              if (typeof window !== 'undefined') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(window as any).__lkScreenShareSender = sender
              }
              if (sender) {
                try {
                  const params = sender.getParameters()
                  // maintain-framerate: sacrifice quality (QP/artifacts) not fps.
                  // Combined with scaleResolutionDownBy=1.0 the encoder can't lower
                  // resolution either, so it only reduces bitrate-per-frame (artifacts)
                  // while keeping both resolution and fps as high as possible.
                  params.degradationPreference = 'maintain-framerate'
                  for (const enc of params.encodings) {
                    enc.scaleResolutionDownBy = 1.0   // lock: no auto-downscale to 960×540
                    if (!enc.maxFramerate) enc.maxFramerate = 60
                  }
                  await sender.setParameters(params)
                } catch {
                  await (pub.track as LocalVideoTrack | undefined)?.setDegradationPreference('maintain-framerate')
                }
              }
              return
            }
            if (pub.source !== Track.Source.Microphone) return
            const applied = await applyMuteToLK(mutedRef.current)
            if (!applied && pub.track) {
              const localTrack = pub.track as LocalAudioTrack
              if (mutedRef.current) { await localTrack.mute() } else { await localTrack.unmute() }
              const mst = pub.track.mediaStreamTrack
              if (mst && typeof window !== 'undefined') {
                mst.enabled = !mutedRef.current
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(window as unknown as { __lkMicTrack?: MediaStreamTrack }).__lkMicTrack = mst
              }
            }
          })() })

          lkRoom.on(RoomEvent.Disconnected, () => {
            console.warn('[voice] LK disconnected (unexpected), joinedRef=', joinedRef.current)
            stopHeartbeat()
            cleanupAudio()
            cleanupScreenShareVideos()
            cleanupCameraVideos()
            lkRoomRef.current = null
            if (joinedRef.current) {
              joinedRef.current   = false
              mutedRef.current    = false
              deafenedRef.current = false
              void api.voice.leave(channel.id).catch(() => {})
              setJoined(false)
              onLeft?.(channel.id)
              onLeaveReady?.(null)
              delete (window as ActiveVoiceWindow).__openspaceLeaveActiveVoice
              setMuted(false); setDeafened(false); setCameraOn(false); setScreenSharing(false)
              sessionStorage.removeItem(VOICE_SESSION_KEY)
              sessionStorage.removeItem(VOICE_MUTED_KEY)
              sessionStorage.removeItem(VOICE_DEAFENED_KEY)
              setParticipants(prev => prev.filter(p => p.id !== myIdentityId))
            }
          })

          await lkRoom.connect(tokenRes.url, tokenRes.token, {
            rtcConfig: { iceServers: iceRes.ice_servers },
          })
          await lkRoom.startAudio().catch(() => {})

          await lkRoom.localParticipant.setMicrophoneEnabled(true).catch(err => {
            console.warn('[voice] mic enable failed:', err)
          })

          await applyMuteToLK(mutedRef.current)

          if (deafenedRef.current) {
            audioElsRef.current.forEach(el => { el.muted = true })
          }
        } catch (err) {
          console.error('[voice] LiveKit connect error:', err)
        }
      })()
    } catch (err) {
      console.error('[voice] join error:', err)
      setJoined(false)
    } finally {
      setConnecting(false)
    }
  }

  async function leaveVoice() {
    joinedRef.current   = false
    stopHeartbeat()
    await stopLocalScreenShare().catch(() => {})
    const lp = lkRoomRef.current?.localParticipant
    if (lp) await lp.setCameraEnabled(false).catch(() => {})
    cleanupAudio()
    cleanupScreenShareVideos()
    cleanupCameraVideos()
    disconnectLiveKit()
    setReconnecting(false)
    sessionStorage.removeItem(VOICE_SESSION_KEY)
    sessionStorage.removeItem(VOICE_MUTED_KEY)
    sessionStorage.removeItem(VOICE_DEAFENED_KEY)
    mutedRef.current    = false
    deafenedRef.current = false
    await api.voice.leave(channel.id).catch(() => {})
    setJoined(false)
    onLeft?.(channel.id)
    onLeaveReady?.(null)
    delete (window as ActiveVoiceWindow).__openspaceLeaveActiveVoice
    setMuted(false); setDeafened(false); setCameraOn(false); setScreenSharing(false)
    setParticipants(prev => prev.filter(p => p.id !== identity?.id))
  }

  async function toggleMute() {
    const next = !muted
    if (lkRoomRef.current === null) {
      mutedRef.current = next
      setMuted(next)
      const applied = await applyMuteToLK(next)
      if (!applied) {
        mutedRef.current = !next
        setMuted(!next)
      }
      return
    }
    mutedRef.current = next
    setMuted(next)

    const applyPromise = applyMuteToLK(next)
    const statePromise = api.voice.updateState(channel.id, { muted: next }).catch(err => {
      console.warn('[voice] mute state update failed:', err)
    })

    const applied = await applyPromise
    if (!applied) {
      if (lkRoomRef.current === null) {
        mutedRef.current = !next
        setMuted(!next)
        return
      }
      if (typeof window !== 'undefined') {
        const w = window as unknown as { __lkMicTrack?: MediaStreamTrack }
        if (w.__lkMicTrack) w.__lkMicTrack.enabled = !next
      }
    }

    await statePromise
  }

  async function toggleDeafen() {
    const next = !deafened
    deafenedRef.current = next
    setDeafened(next)
    audioElsRef.current.forEach(el => { el.muted = next })
    void api.voice.updateState(channel.id, { deafened: next }).catch(() => {})
  }

  async function handleCameraEnded() {
    cleanupLocalCameraPreview(false)
    setCameraOn(false)
    await lkRoomRef.current?.localParticipant?.setCameraEnabled(false).catch(() => {})
    await api.voice.updateState(channel.id, { camera_enabled: false }).catch(() => {})
  }

  async function toggleCamera() {
    const next = !cameraOn
    setCameraOn(next)
    const lp = lkRoomRef.current?.localParticipant
    if (!lp) {
      void api.voice.updateState(channel.id, { camera_enabled: next }).catch(() => {})
      return
    }
    try {
      await lp.setCameraEnabled(next)
    } catch (err) {
      console.warn('[voice] setCameraEnabled failed:', err)
      setCameraOn(!next)
      return
    }
    void api.voice.updateState(channel.id, { camera_enabled: next }).catch(() => {})
    if (next) {
      const camPub = lp.getTrackPublication(Track.Source.Camera)
      const mst = camPub?.track?.mediaStreamTrack
      if (mst) {
        cleanupLocalCameraPreview(true)
        const el = document.createElement('video')
        el.srcObject = new MediaStream([mst])
        el.autoplay = true
        el.playsInline = true
        el.muted = true
        document.body.appendChild(el)
        localCameraElRef.current = el
        setHasLocalCamera(true)
        mst.addEventListener('ended', () => { void handleCameraEnded() }, { once: true })
      }
    } else {
      cleanupLocalCameraPreview(true)
    }
  }

  async function handleScreenShareEnded() {
    setScreenSharing(false)
    await stopLocalScreenShare()
    await api.voice.updateState(channel.id, { screen_sharing: false }).catch(() => {})
  }

  async function startScreenShareWithSource(sourceId: string) {
    setShowPicker(false)
    const lp = lkRoomRef.current?.localParticipant
    let started = false
    let pendingVideoTrack: MediaStreamTrack | null = null

    try {
      // Electron: use chromeMediaSource for precise quality control
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          // @ts-expect-error chromeMediaSource is Electron/Chromium-specific
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1920, maxWidth: 1920,
            minHeight: 1080, maxHeight: 1080,
            minFrameRate: 60, maxFrameRate: 60,
          },
        },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const videoTrack = stream.getVideoTracks()[0]
      pendingVideoTrack = videoTrack ?? null
      if (videoTrack && lp) {
        const localTrack = new LocalVideoTrack(videoTrack)
        if ('contentHint' in videoTrack) (videoTrack as MediaStreamTrack & { contentHint: string }).contentHint = 'detail'
        // Pre-set before sender is assigned so LiveKit applies maintain-framerate from the first frame
        await localTrack.setDegradationPreference('maintain-framerate')
        await lp.publishTrack(localTrack, {
          source: Track.Source.ScreenShare,
          screenShareEncoding: { maxBitrate: 15_000_000, maxFramerate: 60, priority: 'high' },
          videoSimulcast: false,
          degradationPreference: 'maintain-framerate',
        })
        localScreenTrackRef.current = localTrack
        pendingVideoTrack = null
        videoTrack.addEventListener('ended', () => { void handleScreenShareEnded() }, { once: true })
        setupLocalScreenPreview(videoTrack)
        // Note: separate getUserMedia for desktop audio (chromeMediaSource:'desktop') hangs
        // in packaged Electron on Windows because there is no UI to pick the audio device.
        // Audio capture works via the fallback path (setScreenShareEnabled with audio:true)
        // which uses getDisplayMedia and shows the OS picker with an audio checkbox.
        started = true
      }
    } catch (err) {
      pendingVideoTrack?.stop()
      pendingVideoTrack = null
      console.warn('[voice] Electron getUserMedia failed, falling back:', err)
    }

    if (!started && lp) {
      // Fallback: use LiveKit's built-in getDisplayMedia with quality hints
      try {
        const screenPub = await lp.setScreenShareEnabled(
          true,
          { resolution: { width: 1920, height: 1080, frameRate: 60 }, contentHint: 'detail', audio: true },
          { screenShareEncoding: { maxBitrate: 15_000_000, maxFramerate: 60, priority: 'high' }, simulcast: false, degradationPreference: 'maintain-framerate' },
        )
        const localTrack = screenPub?.track instanceof LocalVideoTrack ? screenPub.track : null
        const mst = localTrack?.mediaStreamTrack
        if (!localTrack || !mst) {
          await lp.setScreenShareEnabled(false).catch(() => {})
          throw new Error('screen share fallback did not publish a video track')
        }
        if ('contentHint' in mst) (mst as MediaStreamTrack & { contentHint: string }).contentHint = 'detail'
        // Don't store localScreenTrackRef here — audio is LiveKit-managed via
        // setScreenShareEnabled; stopLocalScreenShare will call setScreenShareEnabled(false)
        // which cleans up both video and audio.
        mst.addEventListener('ended', () => { void handleScreenShareEnded() }, { once: true })
        setupLocalScreenPreview(mst)
        started = true
      } catch (err2) {
        console.error('[voice] screen share fallback failed:', err2)
      }
    }

    if (started) {
      setScreenSharing(true)
      await api.voice.updateState(channel.id, { screen_sharing: true }).catch(() => {})
    } else {
      pendingVideoTrack?.stop()
    }
  }

  async function toggleScreen() {
    if (screenSharing) {
      // Stop sharing
      setScreenSharing(false)
      await stopLocalScreenShare()
      await api.voice.updateState(channel.id, { screen_sharing: false }).catch(() => {})
      return
    }

    // Start: show Electron source picker if available, else use native picker
    const ea = (window as Window & typeof globalThis).electronAPI
    if (ea?.getScreenSources) {
      try {
        const sources = await ea.getScreenSources()
        setPickerSources(sources)
        setShowPicker(true)
      } catch (err) {
        console.warn('[voice] getScreenSources failed, using native picker:', err)
        await startWithNativePicker()
      }
    } else {
      await startWithNativePicker()
    }
  }

  async function startWithNativePicker() {
    const lp = lkRoomRef.current?.localParticipant
    if (!lp) return
    try {
      const screenPub = await lp.setScreenShareEnabled(
        true,
        { resolution: { width: 1920, height: 1080, frameRate: 60 }, contentHint: 'detail', audio: true },
        { screenShareEncoding: { maxBitrate: 15_000_000, maxFramerate: 60, priority: 'high' }, simulcast: false, degradationPreference: 'maintain-framerate' },
      )
      const localTrack = screenPub?.track instanceof LocalVideoTrack ? screenPub.track : null
      const mst = localTrack?.mediaStreamTrack
      if (!localTrack || !mst) {
        await lp.setScreenShareEnabled(false).catch(() => {})
        throw new Error('native screen share did not publish a video track')
      }
      if ('contentHint' in mst) (mst as MediaStreamTrack & { contentHint: string }).contentHint = 'detail'
      // Don't store localScreenTrackRef — audio is LiveKit-managed; setScreenShareEnabled(false) cleans up both.
      mst.addEventListener('ended', () => { void handleScreenShareEnded() }, { once: true })
      setupLocalScreenPreview(mst)
      setScreenSharing(true)
      await api.voice.updateState(channel.id, { screen_sharing: true }).catch(() => {})
    } catch (err) {
      console.error('[voice] native screen share failed:', err)
    }
  }

  useEffect(() => {
    if (remoteScreenShares.length > 0) setStreamViewExpanded(true)
  }, [remoteScreenShares.length])

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="voice-pane">
      <div className="channel-header">
        <span className="channel-icon" aria-hidden="true"><Mic /></span>
        {channel.name}
      </div>

      {/* Local camera self-preview — muted <video> showing own camera feed */}
      {cameraOn && hasLocalCamera && (
        <div
          className="camera-preview-local"
          ref={node => {
            const el = localCameraElRef.current
            if (node && el && el.parentNode !== node) node.appendChild(el)
          }}
        />
      )}

      {/* Remote camera video area */}
      {remoteCameras.length > 0 && (
        <div className="camera-area">
          {remoteCameras.map(({ key, el }) => (
            <div
              key={key}
              className="camera-video-wrap"
              ref={node => { if (node && el.parentNode !== node) { el.style.maxWidth = '100%'; node.appendChild(el) } }}
            />
          ))}
        </div>
      )}

      {/* Local screen share self-preview */}
      {screenSharing && hasLocalScreen && (
        <div className="screen-preview-local">
          <div className="screen-preview-header">
            <span>Your screen</span>
            <button
              className="stream-toggle-btn"
              title={localScreenExpanded ? 'Collapse preview' : 'Expand preview'}
              aria-label={localScreenExpanded ? 'Collapse preview' : 'Expand preview'}
              onClick={() => setLocalScreenExpanded(v => !v)}
            >
              {localScreenExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            </button>
          </div>
          {localScreenExpanded && (
            <div
              className="screen-preview-video"
              ref={node => {
                const el = localScreenElRef.current
                if (node && el && el.parentNode !== node) node.appendChild(el)
              }}
            />
          )}
        </div>
      )}

      {/* Remote screen share video area — each <video> was created by track.attach() and lives in document.body;
          we mount it into the React container via ref callback to display it inline */}
      {remoteScreenShares.length > 0 && (
        <div className="screen-share-area">
          <div className="stream-view-header">
            <span>Screen share{remoteScreenShares.length > 1 ? `s (${remoteScreenShares.length})` : ''}</span>
            <button
              className="stream-toggle-btn"
              title={streamViewExpanded ? 'Collapse screen shares' : 'Expand screen shares'}
              aria-label={streamViewExpanded ? 'Collapse screen shares' : 'Expand screen shares'}
              onClick={() => setStreamViewExpanded(v => !v)}
            >
              {streamViewExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
            </button>
          </div>
          {streamViewExpanded && remoteScreenShares.map(({ key, el }) => {
            const q = ssQuality.get(key)
            return (
              <div
                key={key}
                className="screen-share-video-wrap"
                ref={node => { if (node && el.parentNode !== node) { el.style.maxWidth = '100%'; node.appendChild(el) } }}
              >
                {q && (q.w > 0 || q.fps > 0) && (
                  <div className="ss-quality-badge">
                    {q.w > 0 ? `${q.w}×${q.h}` : ''}{q.w > 0 && q.fps > 0 ? ' · ' : ''}{q.fps > 0 ? `${q.fps} fps` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="voice-participants">
        {participants.length === 0 && (
          <div className="empty-pane" style={{ width: '100%' }}>No one is in this channel yet</div>
        )}
        {participants.map(p => (
          <div key={p.id} className="participant-tile">
            <div className="participant-avatar">{p.display_name?.[0]?.toUpperCase() ?? '?'}</div>
            <div className="participant-name">{p.display_name || p.username}</div>
            <div className="participant-icons">
              {p.muted          && <span title="Muted">🔇</span>}
              {p.deafened       && <span title="Deafened">🔕</span>}
              {p.camera_enabled && <span title="Camera on">📹</span>}
              {p.screen_sharing && <span title="Screen sharing">🖥</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="voice-controls">
        {!joined ? (
          <button
            className="voice-btn voice-btn-toggle"
            onClick={() => { void joinVoice() }}
            disabled={connecting || reconnecting}
          >
            {reconnecting ? 'Reconnecting…' : connecting ? 'Connecting…' : '📞 Join Voice'}
          </button>
        ) : (
          <>
            <button
              className={`voice-btn voice-btn-toggle${muted ? ' active' : ''}`}
              onClick={() => { void toggleMute() }}
            >
              {muted ? '🔇 Unmute' : '🎤 Mute'}
            </button>
            <button
              className={`voice-btn voice-btn-toggle${deafened ? ' active' : ''}`}
              onClick={() => { void toggleDeafen() }}
            >
              {deafened ? '🔕 Undeafen' : '🎧 Deafen'}
            </button>
            <button
              className={`voice-btn voice-btn-toggle${cameraOn ? ' active' : ''}`}
              onClick={() => { void toggleCamera() }}
            >
              {cameraOn ? '📹 Cam Off' : '📷 Cam On'}
            </button>
            <button
              className={`voice-btn voice-btn-toggle${screenSharing ? ' active' : ''}`}
              onClick={() => { void toggleScreen() }}
            >
              {screenSharing ? '🖥 Stop Share' : '🖥 Share Screen'}
            </button>
            <button className="voice-btn voice-btn-leave" onClick={() => { void leaveVoice() }}>
              📵 Leave
            </button>
          </>
        )}
      </div>

      {showPicker && (
        <ScreenSourcePicker
          sources={pickerSources}
          onSelect={(id) => { void startScreenShareWithSource(id) }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
