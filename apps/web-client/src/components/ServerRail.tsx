import React, { useEffect, useState } from 'react'
import { useVault, type ServerEntry } from '../context/VaultContext'
import AddServerModal from './AddServerModal'

function resolveConnectivity(server: ServerEntry): NonNullable<ServerEntry['connectivity_state']> {
  if (server.connectivity_state) return server.connectivity_state
  if (server.connection_state === 'joined') return 'checking'
  if (server.connection_state === 'failed' || server.connection_state === 'revoked') return 'degraded'
  return 'offline'
}

function ConnectionStateIndicator({ server }: { server: ServerEntry }) {
  const connectivity = resolveConnectivity(server)
  return (
    <span
      className={`server-state-dot server-state-dot--${connectivity}`}
      title={`${server.name}: ${connectivity} (${server.connection_state})`}
      aria-label={`${server.name}: ${connectivity}`}
    >
      {connectivity === 'degraded' ? '!' : null}
    </span>
  )
}

function resolveServerAvatarUrl(server: ServerEntry): string | null {
  const avatarUrl = server.avatar_url?.trim()
  if (!avatarUrl) return null
  try {
    return new URL(avatarUrl, server.url).toString()
  } catch {
    return avatarUrl
  }
}

function ServerAvatar({ server }: { server: ServerEntry }) {
  const avatarUrl = resolveServerAvatarUrl(server)
  const [imageFailed, setImageFailed] = useState(false)
  const initials = server.name.slice(0, 2).toUpperCase()

  useEffect(() => {
    setImageFailed(false)
  }, [avatarUrl])

  return (
    <div className="server-avatar" title={server.name}>
      {avatarUrl && !imageFailed ? (
        <img
          className="server-avatar-image"
          src={avatarUrl}
          alt=""
          onError={() => setImageFailed(true)}
          draggable={false}
        />
      ) : (
        <span className="server-avatar-initials">{initials}</span>
      )}
      <ConnectionStateIndicator server={server} />
    </div>
  )
}

export default function ServerRail() {
  const { servers, selectedServerId, selectServer } = useVault()
  const [showAddModal, setShowAddModal] = useState(false)

  return (
    <aside className="server-rail">
      <div className="server-rail-list">
        {servers.map(server => (
          <button
            key={server.server_id}
            className={`server-rail-item ${selectedServerId === server.server_id ? 'server-rail-item--active' : ''}`}
            onClick={() => selectServer(server.server_id)}
            title={server.name}
          >
            <ServerAvatar server={server} />
          </button>
        ))}
      </div>
      <div className="server-rail-footer">
        <button
          className="server-rail-add"
          onClick={() => setShowAddModal(true)}
          title="Add server"
        >
          +
        </button>
      </div>
      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} />}
    </aside>
  )
}
