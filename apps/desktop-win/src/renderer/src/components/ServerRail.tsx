import React, { useEffect, useState, useMemo } from 'react'
import { useVault, type ServerEntry } from '../context/VaultContext'
import { fetchServerMetadata } from '../api/serverMeta'
import AddServerModal from './AddServerModal'

const AVATAR_CACHE_PREFIX = 'openspace_avatar_'

function getCachedAvatar(serverUrl: string): string | null {
  try { return localStorage.getItem(AVATAR_CACHE_PREFIX + serverUrl) } catch { return null }
}

function setCachedAvatar(serverUrl: string, avatarUrl: string): void {
  try { localStorage.setItem(AVATAR_CACHE_PREFIX + serverUrl, avatarUrl) } catch {}
}

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
  const initials = server.name.slice(0, 2).toUpperCase()

  // Priority: vault state → localStorage cache → null (will trigger fetch)
  const initialSrc = useMemo(() => {
    return resolveServerAvatarUrl(server) || getCachedAvatar(server.url) || null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [avatarSrc, setAvatarSrc] = useState<string | null>(initialSrc)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    const vaultUrl = resolveServerAvatarUrl(server)
    if (vaultUrl) {
      setAvatarSrc(vaultUrl)
      setImageFailed(false)
      return
    }

    const cached = getCachedAvatar(server.url)
    if (cached) {
      setAvatarSrc(cached)
      setImageFailed(false)
      return
    }

    if (server.connection_state !== 'joined' || !server.url) return

    // Fetch avatar directly from server metadata — independent of VaultContext update timing
    const controller = new AbortController()
    fetchServerMetadata(server.url, { signal: controller.signal })
      .then(meta => {
        if (meta.avatar_url) {
          setCachedAvatar(server.url, meta.avatar_url)
          setAvatarSrc(meta.avatar_url)
          setImageFailed(false)
          console.debug('[ServerAvatar] fetched and cached avatar for', server.url, 'len:', meta.avatar_url.length)
        }
      })
      .catch(err => {
        console.warn('[ServerAvatar] metadata fetch failed:', err)
      })
    return () => controller.abort()
  }, [server.url, server.avatar_url, server.connection_state])

  return (
    <div className="server-avatar" title={server.name}>
      {avatarSrc && !imageFailed ? (
        <img
          className="server-avatar-image"
          src={avatarSrc}
          alt=""
          onError={() => {
            console.warn('[ServerAvatar] img onError for src[:50]:', avatarSrc?.slice(0, 50))
            setImageFailed(true)
          }}
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
