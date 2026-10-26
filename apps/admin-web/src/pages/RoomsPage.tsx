import React, { useEffect, useState, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { Room, Channel } from '../api/types'

const TYPE_LABEL: Record<string, string> = { text: 'Text', voice: 'Voice' }
const TYPE_CLASS: Record<string, string> = { text: 'badge badge-muted', voice: 'badge badge-success' }
const TYPE_ICON: Record<string, string> = { text: '#', voice: 'voice' }

export default function RoomsPage() {
  const [groups, setGroups] = useState<Room[]>([])
  const [roomsByGroup, setRoomsByGroup] = useState<Record<string, Channel[]>>({})
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [defaultRoomType, setDefaultRoomType] = useState<'text' | 'voice'>('text')
  const [description, setDescription] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomType, setRoomType] = useState<'text' | 'voice'>('text')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    api.rooms.list()
      .then(async nextGroups => {
        setGroups(nextGroups)
        setSelectedGroupId(current => current || nextGroups[0]?.id || '')
        const entries = await Promise.all(
          nextGroups.map(async group => [group.id, await api.channels.list(group.id)] as const),
        )
        setRoomsByGroup(Object.fromEntries(entries))
      })
      .catch(err => setError(err instanceof ApiError ? err.code : String(err)))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault()
    setCreatingGroup(true)
    setError(null)
    try {
      await api.rooms.create(groupName.trim(), defaultRoomType, description.trim() || undefined, 'general')
      setGroupName('')
      setDescription('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setCreatingGroup(false)
    }
  }

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault()
    if (!selectedGroupId) return
    setCreatingRoom(true)
    setError(null)
    try {
      await api.channels.create(selectedGroupId, roomName.trim(), roomType)
      setRoomName('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setCreatingRoom(false)
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm('Delete this channel group and all rooms inside it? This cannot be undone.')) return
    setDeleting(id)
    try {
      await api.rooms.delete(id)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setDeleting(null)
    }
  }

  async function handleDeleteRoom(groupId: string, roomId: string) {
    if (!confirm('Delete this room? This cannot be undone.')) return
    setDeleting(roomId)
    try {
      await api.channels.delete(groupId, roomId)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Channels and rooms</h2>
      </div>
      {error && <div className="alert alert-error" onClick={() => setError(null)}>{error} x</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Create channel</div>
        <form onSubmit={e => { void handleCreateGroup(e) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180, flex: '1 1 180px' }}>
            <label htmlFor="group-name">Name</label>
            <input
              id="group-name"
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Channel name"
              required
              maxLength={100}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 150 }}>
            <label htmlFor="default-room-type">Default room</label>
            <select
              id="default-room-type"
              value={defaultRoomType}
              onChange={e => setDefaultRoomType(e.target.value as 'text' | 'voice')}
            >
              <option value="text"># Text general</option>
              <option value="voice">Voice general</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 200, flex: '2 1 200px' }}>
            <label htmlFor="group-desc">Description</label>
            <input
              id="group-desc"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional"
              maxLength={300}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: 38, padding: '0 20px' }} disabled={creatingGroup || !groupName.trim()}>
            {creatingGroup ? 'Creating...' : 'Create channel'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Create room inside channel</div>
        <form onSubmit={e => { void handleCreateRoom(e) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180, flex: '1 1 180px' }}>
            <label htmlFor="group-select">Channel</label>
            <select
              id="group-select"
              value={selectedGroupId}
              onChange={e => setSelectedGroupId(e.target.value)}
              disabled={groups.length === 0}
            >
              {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180, flex: '1 1 180px' }}>
            <label htmlFor="room-name">Room name</label>
            <input
              id="room-name"
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="general"
              required
              maxLength={100}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 130 }}>
            <label htmlFor="room-type">Type</label>
            <select
              id="room-type"
              value={roomType}
              onChange={e => setRoomType(e.target.value as 'text' | 'voice')}
            >
              <option value="text"># Text</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: 38, padding: '0 20px' }} disabled={creatingRoom || !roomName.trim() || !selectedGroupId}>
            {creatingRoom ? 'Creating...' : 'Create room'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Structure</div>
        {groups.length === 0 ? (
          <div className="table-empty">No channels yet</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Channel / room</th>
                <th>Type</th>
                <th>Description</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(group => {
                const nested = roomsByGroup[group.id] ?? []
                return [
                  <tr key={group.id}>
                    <td style={{ fontWeight: 700 }}>{group.name}</td>
                    <td><span className="badge badge-muted">Channel</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{group.description ?? '-'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(group.created_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger-ghost"
                        style={{ width: 'auto' }}
                        disabled={deleting === group.id}
                        onClick={() => { void handleDeleteGroup(group.id) }}
                      >
                        {deleting === group.id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>,
                  ...nested.map(room => (
                    <tr key={room.id}>
                      <td style={{ paddingLeft: 28 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>
                          {TYPE_ICON[room.type] ?? '#'}
                        </span>
                        {room.name}
                      </td>
                      <td><span className={TYPE_CLASS[room.type] ?? 'badge badge-muted'}>{TYPE_LABEL[room.type] ?? room.type}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>Room</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(room.created_at).toLocaleDateString('ru-RU')}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger-ghost"
                          style={{ width: 'auto' }}
                          disabled={deleting === room.id}
                          onClick={() => { void handleDeleteRoom(group.id, room.id) }}
                        >
                          {deleting === room.id ? '...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
