import React, { useState } from 'react'
import { useVault, type ServerEntry } from '../context/VaultContext'
import { createPairingToken } from '../api/devicePairing'
import { uploadBundle } from '../api/relay'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { encryptBundle, serializeBundle } from '../crypto/bundle'

interface Props {
  onClose: () => void
}

type ExportStep = 'select' | 'creating' | 'done' | 'error'

const DEFAULT_RELAY = 'https://open-space.online'

export default function PairingExportModal({ onClose }: Props) {
  const dialogRef = useModalAccessibility(onClose)
  const { servers } = useVault()
  const joinedServers = servers.filter(s => s.connection_state === 'joined')
  const [selected, setSelected] = useState<Set<string>>(new Set(joinedServers.map(s => s.server_id)))
  const [step, setStep] = useState<ExportStep>('select')
  const [transferLink, setTransferLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  function toggleServer(serverId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(serverId)) next.delete(serverId)
      else next.add(serverId)
      return next
    })
  }

  async function handleCreate() {
    setStep('creating')
    setError(null)
    try {
      const serversToInclude = joinedServers.filter(s => selected.has(s.server_id))
      if (serversToInclude.length === 0) {
        setError('Select at least one server')
        setStep('select')
        return
      }

      const bundleServers = await Promise.all(
        serversToInclude.map(async (server) => {
          const token = await createPairingToken(server.url, server.access_token ?? '', 1800)
          return {
            server_id: server.server_id,
            server_url: server.url,
            pairing_token: token.pairing_token,
            display_name: server.name,
            ...(server.avatar_url ? { avatar_url: server.avatar_url } : {}),
          }
        })
      )

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000)

      const { encrypted, keyBase64 } = await encryptBundle({
        servers: bundleServers,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })

      const serialized = serializeBundle(encrypted)
      const { transfer_id } = await uploadBundle(DEFAULT_RELAY, serialized, 1800)

      const link = `openspace://pair?relay=${encodeURIComponent(DEFAULT_RELAY)}&transfer_id=${transfer_id}#key=${keyBase64}`
      setTransferLink(link)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transfer link')
      setStep('error')
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label="Create transfer link" tabIndex={-1}>
        <div className="modal-header">
          <h2>Create transfer link</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          {step === 'select' && (
            <div>
              <p className="info-text">Select servers whose access should be transferred:</p>
              {joinedServers.length === 0 && (
                <p className="empty-state">There are no connected servers to transfer.</p>
              )}
              {joinedServers.map(server => (
                <label key={server.server_id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selected.has(server.server_id)}
                    onChange={() => toggleServer(server.server_id)}
                  />
                  {server.name} <span className="server-url-hint">({server.url})</span>
                </label>
              ))}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleCreate()}
                  disabled={selected.size === 0}
                >
                  Create link
                </button>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="loading-state">Creating transfer link...</div>
          )}

          {step === 'done' && (
            <div>
              <p className="success-message">Link created. It is valid for 30 minutes.</p>
              <div className="transfer-link-box">
                <code className="transfer-link">{transferLink}</code>
              </div>
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => { void navigator.clipboard.writeText(transferLink) }}
                >
                  Copy
                </button>
                <button className="btn btn-primary" onClick={onClose}>Done</button>
              </div>
              <p className="transfer-link-warning">
                The encryption key is in the link fragment after #. Do not send the link through insecure channels.
                The link can be used once.
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setStep('select')}>Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
