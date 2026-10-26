import React, { useState, FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { fetchServerMetadata, normalizeBaseUrl, serverAddressWarning, type ServerMetadata } from '../api/serverMeta'
import { useVault } from '../context/VaultContext'
import { getOrCreateDeviceKeypair, exportPublicKeySpki, signChallenge } from '../crypto/keypair'
import { deviceRegChallenge, deviceRegComplete } from '../api/deviceReg'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

type Step = 'url' | 'confirm' | 'invite' | 'registering' | 'done' | 'pending'

interface Props {
  onClose: () => void
}

export default function AddServerModal({ onClose }: Props) {
  const dialogRef = useModalAccessibility(onClose)
  const { addServer, profile, getServerByUrl } = useVault()
  const [step, setStep] = useState<Step>('url')
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<ServerMetadata | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [useProfileName, setUseProfileName] = useState(true)
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDiscover(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const normalizedUrl = normalizeBaseUrl(url)
      const serverMeta = await fetchServerMetadata(normalizedUrl)
      // Check for duplicate by server_id
      const existing = getServerByUrl(normalizedUrl)
      if (existing) {
        setError(`This server has already been added (${existing.name})`)
        setLoading(false)
        return
      }
      setUrl(normalizedUrl)
      setMeta(serverMeta)
      setDisplayName(profile?.name ?? '')
      if (serverMeta.registration_policy === 'closed') {
        setError('Registration is closed on this server.')
        setLoading(false)
        return
      }
      setStep('confirm')
    } catch (err) {
      setError(`Server unavailable: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!meta) return
    if (meta.registration_policy === 'invite_code_only') {
      setStep('invite')
      return
    }
    await register()
  }

  async function register() {
    if (!meta) return
    setStep('registering')
    setError(null)
    try {
      const keypair = await getOrCreateDeviceKeypair(meta.server_id)
      const pubKey = await exportPublicKeySpki(keypair.publicKey)
      const name = useProfileName ? (profile?.name ?? displayName) : displayName

      const normalizedUrl = normalizeBaseUrl(url)
      const challenge = await deviceRegChallenge(
        normalizedUrl,
        pubKey,
        name,
        inviteCode || null,
        'web',
      )
      const sig = await signChallenge(keypair.privateKey, {
        op: 'device_registration',
        server_id: challenge.server_id,
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        device_public_key: pubKey,
        client_type: 'web',
        expires_at: challenge.expires_at,
      })
      const result = await deviceRegComplete(normalizedUrl, challenge.challenge_id, sig)

      await addServer({
        server_id: meta.server_id,
        name: meta.name,
        url: normalizedUrl,
        ...(meta.avatar_url ? { avatar_url: meta.avatar_url } : {}),
        connection_state: result.identity_status === 'active' ? 'joined' : 'pending_approval',
        device_id: result.device_id,
        server_identity_id: result.server_identity_id,
        ...(result.access_token !== null ? { access_token: result.access_token } : {}),
        added_at: new Date().toISOString(),
      })

      setStep(result.identity_status === 'active' ? 'done' : 'pending')
    } catch (err) {
      setError(registrationErrorMessage(err))
      setStep(meta.registration_policy === 'invite_code_only' ? 'invite' : 'confirm')
    }
  }

  return createPortal((
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label="Add server" tabIndex={-1}>
        <div className="modal-header">
          <h2>Add server</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error" role="alert" aria-live="assertive">{error}</div>}
          {serverAddressWarning(url) && <div className="alert alert-warning" role="status">{serverAddressWarning(url)}</div>}

          {step === 'url' && (
            <form onSubmit={e => { void handleDiscover(e) }}>
              <div className="field">
                <label htmlFor="server-url">Server address</label>
                <input
                  id="server-url"
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://space.example.com or IP address"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading || !url}>
                {loading ? 'Checking...' : 'Find server'}
              </button>
            </form>
          )}

          {step === 'confirm' && meta && (
            <div>
              <div className="server-info-card">
                <div className="server-info-name">{meta.name}</div>
                <div className="server-info-url">{meta.public_url || url}</div>
                <div className="server-info-policy">Registration: {policyLabel(meta.registration_policy)}</div>
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={useProfileName}
                    onChange={e => setUseProfileName(e.target.checked)}
                  />
                  {' '}Use local profile name
                </label>
              </div>
              {!useProfileName && (
                <div className="field">
                  <label htmlFor="server-display-name">Name on this server</label>
                  <input
                    id="server-display-name"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setStep('url')}>Back</button>
                <button className="btn btn-primary" onClick={() => void handleJoin()}>
                  {meta.registration_policy === 'approval_required' ? 'Submit request' : 'Connect'}
                </button>
              </div>
            </div>
          )}

          {step === 'invite' && (
            <form onSubmit={e => { e.preventDefault(); void register() }}>
              <div className="field">
                <label htmlFor="invite-code">Invite code</label>
                <input
                  id="invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="XXXXXXXXXXXXXXXX"
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStep('confirm')}>Back</button>
                <button type="submit" className="btn btn-primary" disabled={!inviteCode}>Connect</button>
              </div>
            </form>
          )}

          {step === 'registering' && (
            <div className="loading-state">Connecting to server...</div>
          )}

          {step === 'done' && (
            <div>
              <p className="success-message">Server added successfully!</p>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          )}

          {step === 'pending' && (
            <div>
              <p className="info-message">
                Request submitted. Access will be granted after administrator approval.
              </p>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

function registrationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : 'registration_failed'
  switch (code) {
    case 'invite_expired': return 'This invite has expired. Ask an administrator for a new invite.'
    case 'invite_revoked':
    case 'invite_not_found':
    case 'invite_invalid':
    case 'invite_exhausted': return 'This invite is invalid or has been revoked. Ask an administrator for a new invite.'
    case 'registration_closed': return 'Registration is closed on this server.'
    case 'forbidden': return 'This server did not permit registration for this profile.'
    default: return `Registration failed: ${code}`
  }
}

function policyLabel(policy: string): string {
  switch (policy) {
    case 'open': return 'open'
    case 'invite_code_only': return 'invite code only'
    case 'approval_required': return 'approval required'
    case 'closed': return 'closed'
    default: return policy
  }
}
