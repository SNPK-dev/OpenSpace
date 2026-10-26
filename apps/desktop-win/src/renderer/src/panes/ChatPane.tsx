import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Hash, Paperclip, X } from 'lucide-react'
import { api, ApiError, uploadToSignedURL } from '../api/client'
import { clientCache } from '../cache/clientCache'
import { useVault } from '../context/VaultContext'
import { useWS, useWSEvent } from '../context/WSContext'
import type { Channel, Message, MessageCreatedEvent, MessageDeletedEvent, Identity } from '../api/types'

interface Props { channel: Channel }
const MAX_RENDERED_MESSAGES = 500
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
const boundedMessages = (messages: Message[]) => messages.slice(0, MAX_RENDERED_MESSAGES)

export default function ChatPane({ channel }: Props) {
  const { selectedServerId } = useVault()
  const [identity, setIdentity] = useState<Identity | null>(null)
  useEffect(() => { void api.me.get().then(setIdentity).catch(() => null) }, [])
  const { connected } = useWS()
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevConnectedRef = useRef(connected)
  const uploadControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setMessages([])
    setHasMore(false)
    setLoading(true)
    setLoadError(false)
    void api.me.permissions().then(res => setPermissions(res.permissions)).catch(() => setPermissions([]))
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, selectedServerId])

  useEffect(() => {
    const wasConnected = prevConnectedRef.current
    prevConnectedRef.current = connected
    if (connected && !wasConnected) void load(undefined, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  async function load(before?: string, silent = false) {
    if (!before && !silent) { setLoading(true); setLoadError(false) }
    try {
      const res = await api.messages.list(channel.room_id, channel.id, before)
      if (!before && selectedServerId) void clientCache.saveChannelMessages(selectedServerId, channel.id, res)
      setMessages(prev => {
        if (before) return boundedMessages([...prev, ...res.messages])
        if (silent) {
          const serverIds = new Set(res.messages.map(m => m.id))
          const localOnly = prev.filter(m => !serverIds.has(m.id))
          return boundedMessages([...localOnly, ...res.messages])
        }
        return boundedMessages(res.messages)
      })
      setHasMore(res.has_more)
    } catch {
      if (!before && !silent && selectedServerId) {
        const cached = await clientCache.loadChannelMessages(selectedServerId, channel.id)
        if (cached) {
          setMessages(boundedMessages(cached.messages))
          setHasMore(false)
          setLoadError(false)
        } else {
          setLoadError(true)
        }
      } else if (!before && !silent) {
        setLoadError(true)
      }
    } finally {
      if (!before && !silent) setLoading(false)
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return
    const oldest = messages[messages.length - 1]
    if (!oldest) return
    setLoadingMore(true)
    await load(oldest.id)
    setLoadingMore(false)
  }

  useWSEvent<MessageCreatedEvent>('message.created', (e) => {
    if (e.channel_id !== channel.id) return
    setMessages(prev => prev.some(m => m.id === e.message.id) ? prev : boundedMessages([e.message, ...prev]))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  })

  useWSEvent<MessageDeletedEvent>('message.deleted', (e) => {
    if (e.channel_id !== channel.id) return
    setMessages(prev => prev.filter(m => m.id !== e.message_id))
  })

  async function sendMessage() {
    const content = input.trim()
    if ((!content && !selectedFile) || sending) return
    setSending(true)
    setUploadError('')
    try {
      let attachmentId: string | undefined
      if (selectedFile) {
        const controller = new AbortController()
        uploadControllerRef.current = controller
        setUploadProgress(0)
        const requested = await api.attachments.requestUpload(selectedFile)
        await uploadToSignedURL(requested.upload_url, selectedFile, controller.signal, setUploadProgress)
        await api.attachments.confirm(requested.attachment_id)
        attachmentId = requested.attachment_id
      }
      const msg = await api.messages.send(channel.room_id, channel.id, content || selectedFile!.name, attachmentId)
      // Add optimistically so the sender sees it immediately even if the WS
      // event is delayed; the WS handler deduplicates by id.
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [msg, ...prev])
      setInput('')
      setSelectedFile(null)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setUploadError('Upload cancelled. Choose a file to retry.')
      else setUploadError(err instanceof ApiError ? `Upload or send failed: ${err.code}` : 'Upload or send failed. Retry when the connection is available.')
    } finally {
      setSending(false)
      setUploadProgress(null)
      uploadControllerRef.current = null
    }
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  function selectAttachment(file: File | null) {
    setUploadError('')
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      setSelectedFile(null)
      setUploadError('File exceeds the 50 MB upload limit.')
      return
    }
    setSelectedFile(file)
  }

  async function deleteMessage(msg: Message) {
    await api.messages.delete(channel.room_id, channel.id, msg.id)
    setMessages(prev => prev.filter(m => m.id !== msg.id))
  }

  return (
    <div className="chat-pane">
      <div className="channel-header">
        <span className="channel-icon" aria-hidden="true"><Hash /></span>
        {channel.name}
      </div>

      <div className="messages-list">
        {loading && <div className="empty-pane">Loading messages…</div>}
        {!loading && loadError && (
          <div className="chat-error-banner">
            Failed to load messages.
            <button onClick={() => { void load() }}>Retry</button>
          </div>
        )}
        {!loading && !loadError && messages.length === 0 && (
          <div className="empty-pane">No messages yet. Say hello!</div>
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
              {msg.attachment && <a className="message-attachment" href={msg.attachment.url} target="_blank" rel="noreferrer" download={msg.attachment.filename}>{msg.attachment.filename}</a>}
            </div>
            {(msg.sender.id === identity?.id || permissions.includes('message.delete_any')) && (
              <button className="msg-delete" onClick={() => { void deleteMessage(msg) }}>✕</button>
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
        {uploadError && <div className="chat-error-banner" role="alert">{uploadError}</div>}
        {selectedFile && <div className="upload-state" role="status" aria-live="polite"><span>{selectedFile.name}{uploadProgress !== null ? ` — ${uploadProgress}%` : ''}</span><button type="button" className="btn-icon" aria-label={sending ? 'Cancel upload' : 'Remove attachment'} onClick={() => { if (sending) uploadControllerRef.current?.abort(); else setSelectedFile(null) }}><X /></button></div>}
        <div className="chat-input-wrap">
          {permissions.includes('file.upload') && <label className="btn-icon attachment-picker" aria-label="Attach file" title="Attach file"><Paperclip /><input type="file" onChange={event => { selectAttachment(event.target.files?.[0] ?? null); event.target.value = '' }} disabled={sending} /></label>}
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={`Message #${channel.name}`}
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
