import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, useParams } from 'react-router-dom'
import { Mic } from 'lucide-react'
import Sidebar from './Sidebar'
import ServerRail from './ServerRail'
import ChatPane from '../panes/ChatPane'
import DMPane from '../panes/DMPane'
import PeoplePane from '../panes/PeoplePane'
import { api } from '../api/client'
import { clientCache } from '../cache/clientCache'
import { useVault } from '../context/VaultContext'
import type { Channel, Room } from '../api/types'

const VoicePane = React.lazy(() => import('../panes/VoicePane'))

type LeaveVoiceHandler = () => Promise<void>

interface ChannelRouterProps {
  activeVoiceChannel: Channel | null
  setVisibleVoiceChannelId: (channelId: string | null) => void
  setVoiceHostChannel: (channel: Channel | null) => void
  switchToVoiceChannel: (channel: Channel) => Promise<void>
}

function VoiceSwitchPane({
  channel,
  activeChannel,
  onSwitch,
}: {
  channel: Channel
  activeChannel: Channel
  onSwitch: (channel: Channel) => Promise<void>
}) {
  const [switching, setSwitching] = useState(false)

  async function handleSwitch() {
    setSwitching(true)
    try {
      await onSwitch(channel)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="voice-pane voice-switch-pane">
      <div className="channel-header">
        <span className="channel-icon" aria-hidden="true"><Mic /></span>
        {channel.name}
      </div>
      <div className="voice-switch-body">
        <div>
          <strong>Voice already active</strong>
          <span>You are connected to {activeChannel.name}. Joining this room will leave the current one first.</span>
        </div>
        <button className="voice-btn voice-btn-toggle" onClick={() => { void handleSwitch() }} disabled={switching}>
          {switching ? 'Switching…' : `Join ${channel.name}`}
        </button>
      </div>
    </div>
  )
}

function ChannelRouter({
  activeVoiceChannel,
  setVisibleVoiceChannelId,
  setVoiceHostChannel,
  switchToVoiceChannel,
}: ChannelRouterProps) {
  const { channelId } = useParams<{ channelId: string }>()
  const { selectedServerId } = useVault()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return
    let cancelled = false
    setLoading(true)
    setChannel(null)
    void (async () => {
      // The sidebar has already loaded and cached the visible channel. Resolve it
      // locally first; probing every historic room over the network can stall a click.
      let rooms: Room[] = selectedServerId ? (await clientCache.loadRooms(selectedServerId)) ?? [] : []
      if (!rooms.length) {
        try {
          rooms = (await api.rooms.list()).rooms
          if (selectedServerId) void clientCache.saveRooms(selectedServerId, rooms)
        } catch { /* Show the not-found state below. */ }
      }
      if (selectedServerId) {
        const cached = await Promise.all(rooms.map(room => clientCache.loadChannels(selectedServerId, room.id)))
        const match = cached.flatMap(items => items ?? []).find(item => item.id === channelId)
        if (match) {
          if (!cancelled) { setChannel(match); setLoading(false) }
          return
        }
      }
      const candidates = await Promise.all(rooms.map(room =>
        api.channels.get(room.id, channelId).catch(() => null)))
      if (!cancelled) { setChannel(candidates.find(Boolean) ?? null); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [channelId, selectedServerId])

  if (!channelId) return <div className="empty-pane">Select a channel</div>
  if (loading) return <div className="empty-pane">Loading…</div>
  if (!channel) return <div className="empty-pane">Channel not found</div>

  if (channel.type === 'voice') {
    return (
      <VoiceRoute
        channel={channel}
        activeVoiceChannel={activeVoiceChannel}
        setVisibleVoiceChannelId={setVisibleVoiceChannelId}
        setVoiceHostChannel={setVoiceHostChannel}
        switchToVoiceChannel={switchToVoiceChannel}
      />
    )
  }
  return <ChatPane channel={channel} />
}

function VoiceRoute({
  channel,
  activeVoiceChannel,
  setVisibleVoiceChannelId,
  setVoiceHostChannel,
  switchToVoiceChannel,
}: {
  channel: Channel
  activeVoiceChannel: Channel | null
  setVisibleVoiceChannelId: (channelId: string | null) => void
  setVoiceHostChannel: (channel: Channel | null) => void
  switchToVoiceChannel: (channel: Channel) => Promise<void>
}) {
  useEffect(() => {
    if (!activeVoiceChannel || activeVoiceChannel.id === channel.id) {
      setVoiceHostChannel(channel)
      setVisibleVoiceChannelId(channel.id)
    } else {
      setVisibleVoiceChannelId(null)
    }
    return () => {
      setVisibleVoiceChannelId(null)
    }
  }, [activeVoiceChannel, channel, setVisibleVoiceChannelId, setVoiceHostChannel])

  if (activeVoiceChannel && activeVoiceChannel.id !== channel.id) {
    return <VoiceSwitchPane channel={channel} activeChannel={activeVoiceChannel} onSwitch={switchToVoiceChannel} />
  }

  return null
}

export default function MainLayout() {
  const [voiceHostChannel, setVoiceHostChannel] = useState<Channel | null>(null)
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null)
  const [visibleVoiceChannelId, setVisibleVoiceChannelId] = useState<string | null>(null)
  const [autoJoinToken, setAutoJoinToken] = useState(0)
  const activeLeaveRef = useRef<LeaveVoiceHandler | null>(null)

  const handleVoiceLeft = useCallback((channelId: string) => {
    setActiveVoiceChannel(current => (current?.id === channelId ? null : current))
    activeLeaveRef.current = null
  }, [])

  const switchToVoiceChannel = useCallback(async (channel: Channel) => {
    const leave = activeLeaveRef.current
    if (leave) await leave()
    setActiveVoiceChannel(null)
    setVoiceHostChannel(channel)
    setVisibleVoiceChannelId(channel.id)
    setAutoJoinToken(token => token + 1)
  }, [])

  const voiceHostVisible = Boolean(voiceHostChannel && visibleVoiceChannelId === voiceHostChannel.id)

  return (
    <div className="app-layout">
      <ServerRail />
      <Sidebar />
      <div className="main-area">
        {voiceHostChannel && (
          <div className={`voice-host${voiceHostVisible ? '' : ' voice-host--hidden'}`}>
            <React.Suspense fallback={<div className="empty-pane" role="status">Loading voice...</div>}>
              <VoicePane
                key={voiceHostChannel.id}
                channel={voiceHostChannel}
                autoJoinToken={autoJoinToken}
                persistOnUnmount={activeVoiceChannel?.id === voiceHostChannel.id}
                onJoined={setActiveVoiceChannel}
                onLeft={handleVoiceLeft}
                onLeaveReady={handler => { activeLeaveRef.current = handler }}
              />
            </React.Suspense>
          </div>
        )}
        <Routes>
          <Route path="/" element={<div className="empty-pane">Select a channel to get started</div>} />
          <Route
            path="/channels/:channelId"
            element={(
              <ChannelRouter
                activeVoiceChannel={activeVoiceChannel}
                setVisibleVoiceChannelId={setVisibleVoiceChannelId}
                setVoiceHostChannel={setVoiceHostChannel}
                switchToVoiceChannel={switchToVoiceChannel}
              />
            )}
          />
          <Route path="/dm/:convId" element={<DMPane />} />
          <Route path="/people" element={<PeoplePane />} />
          <Route path="/people/:memberId" element={<PeoplePane />} />
        </Routes>
      </div>
    </div>
  )
}
