import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { clientCache } from '../cache/clientCache'
import { useVault } from '../context/VaultContext'
import { useWS, useWSEvent } from '../context/WSContext'
import type { Identity, DMMessage, DMConversation, DMMessageCreatedEvent } from '../api/types'

export default function DMPane() {
  const { convId } = useParams<{ convId: string }>()
  const { selectedServerId } = useVault()
  const [identity, setIdentity] = useState<Identity | null>(null)
  useEffect(() => { void api.me.get().then(setIdentity).catch(() => null) }, [])
  const { connected } = useWS()
  const [conv, setConv] = useState<DMConversation | null>(null)
  const [messages, setMessages] = useState<DMMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevConnectedRef = useRef(connected)

  useEffect(() => {
    if (!convId) return
    setMessages([])
    setHasMore(false)
    setConv(null)
    setLoading(true)
    setLoadError(false)
    void loadDM(convId)
  }, [convId, selectedServerId])

  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (connected && !wasConnected && convId) void loadDM(convId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function loadDM(id: string, silent = false) {
    if (!silent) { setLoading(true); setLoadError(false) }
    try {
      const [convs, msgs] = await Promise.all([
        api.dm.listConversations(),
        api.dm.list(id),
      ])
      setConv(convs.conversations.find(c => c.id === id) ?? null)
      setMessages(msgs.messages)
      setHasMore(msgs.has_more)
      if (selectedServerId) {
        void clientCache.saveDMConversations(selectedServerId, convs.conversations)
        void clientCache.saveDMMessages(selectedServerId, id, msgs)
      }
    } catch {
      if (!silent && selectedServerId) {
        const [cachedConvs, cachedMsgs] = await Promise.all([
          clientCache.loadDMConversations(selectedServerId),
          clientCache.loadDMMessages(selectedServerId, id),
        ])
        if (cachedMsgs) {
          setConv(cachedConvs?.find(c => c.id === id) ?? null)
          setMessages(cachedMsgs.messages)
          setHasMore(false)
          setLoadError(false)
        } else {
          setLoadError(true)
        }
      } else if (!silent) {
        setLoadError(true)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function loadMore() {
    if (!convId || !hasMore || loadingMore) return
    const oldest = messages[messages.length - 1]
    if (!oldest) return
    setLoadingMore(true)
    try {
      const res = await api.dm.list(convId, oldest.id)
      setMessages(prev => [...prev, ...res.messages])
      setHasMore(res.has_more)
    } finally {
      setLoadingMore(false)
    }
  }

  useWSEvent<DMMessageCreatedEvent>('dm.message.created', (e) => {
    if (e.conversation_id !== convId) return
    setMessages(prev => prev.some(m => m.id === e.message.id) ? prev : [e.message, ...prev])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  })

  async function sendMessage() {
    if (!convId) return
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    try {
      await api.dm.send(convId, content)
    } catch (err) {
      setInput(content)
      if (err instanceof ApiError) console.error(err.code)
    } finally {
      setSending(false)
    }
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  async function deleteMessage(msgId: string) {
    if (!convId) return
    await api.dm.delete(convId, msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  const peerName = conv ? (conv.peer.display_name || conv.peer.username) : '…'

  return (
    <div className="dm-pane">
      <div className="channel-header">
        <span className="channel-icon" aria-hidden="true"><MessageCircle /></span>
        {peerName}
      </div>

      <div className="messages-list">
        {loading && <div className="empty-pane">Loading messages…</div>}
        {!loading && loadError && (
          <div className="chat-error-banner">
            Failed to load messages.
            <button onClick={() => { if (convId) void loadDM(convId) }}>Retry</button>
          </div>
        )}
        {!loading && !loadError && messages.length === 0 && (
          <div className="empty-pane">No messages yet. Start the conversation!</div>
        )}
        <div ref={bottomRef} />
        {messages.map(msg => (
          <div key={msg.id} className="message-group">
            <div className="msg-avatar">{msg.sender.display_name?.[0]?.toUpperCase() ?? '?'}</div>
            <div className="msg-body">
              <div className="msg-header">
                <span className="msg-author">{msg.sender.display_name || msg.sender.username}</span>
                <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="msg-content">{msg.content}</div>
            </div>
            {msg.sender.id === identity?.id && (
              <button className="msg-delete" onClick={() => { void deleteMessage(msg.id) }}>✕</button>
            )}
          </div>
        ))}
        {hasMore && (
          <button className="load-more-btn" onClick={() => { void loadMore() }} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load older messages'}
          </button>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={`Message ${peerName}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
      </div>
    </div>
  )
}
