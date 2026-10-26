import React, { useState, useEffect, useCallback, FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import type { InviteDetail } from '../api/types'

function formatExpiry(expiresAt: string | null): { label: string; remaining: string | null; expired: boolean } {
  if (!expiresAt) return { label: 'Never', remaining: null, expired: false }
  const exp = new Date(expiresAt)
  const now = new Date()
  const expired = exp <= now
  const label = exp.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  if (expired) return { label, remaining: null, expired: true }
  const diffMs = exp.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffM = Math.floor((diffMs % 3600000) / 60000)
  const remaining = diffH > 0 ? `in ${diffH}h ${diffM}m` : `in ${diffM}m`
  return { label, remaining, expired: false }
}

function inviteStatus(inv: InviteDetail): 'active' | 'expired' | 'revoked' | 'exhausted' {
  if (inv.revoked_at) return 'revoked'
  if (inv.use_count >= inv.max_uses) return 'exhausted'
  if (inv.expires_at && new Date(inv.expires_at) <= new Date()) return 'expired'
  return 'active'
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  exhausted: 'Exhausted',
}

const STATUS_CLASS: Record<string, string> = {
  active:    'badge badge-success',
  expired:   'badge badge-muted',
  revoked:   'badge badge-danger',
  exhausted: 'badge badge-warning',
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<InviteDetail[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [maxUses, setMaxUses] = useState(1)
  const [expiresInHours, setExpiresInHours] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const list = await api.invites.list()
      setInvites(list)
    } catch (err) {
      setListError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setNewCode(null)
    setCreating(true)
    try {
      const hours = expiresInHours ? parseInt(expiresInHours, 10) : undefined
      const res = await api.invites.create(maxUses, hours)
      setNewCode(res.code)
      void load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(code: string) {
    if (revoking) return
    setRevoking(code)
    try {
      await api.invites.revoke(code)
      setInvites(prev => prev.map(inv => inv.code === code ? { ...inv, revoked_at: new Date().toISOString() } : inv))
    } catch {/* ignore */} finally {
      setRevoking(null)
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {/* ignore */})
  }

  const active = invites.filter(i => inviteStatus(i) === 'active')
  const archive = invites.filter(i => inviteStatus(i) !== 'active')

  return (
    <div className="page">
      <div className="page-header">
        <h2>Invites</h2>
      </div>

      {/* Create form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Create invite</div>
        {createError && <div className="alert alert-error">{createError}</div>}
        <form onSubmit={e => { void handleCreate(e) }} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 120 }}>
            <label htmlFor="max_uses">Maximum uses</label>
            <input
              id="max_uses"
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={e => setMaxUses(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="expires">Lifetime (hours)</label>
            <input
              id="expires"
              type="number"
              min={1}
              value={expiresInHours}
              onChange={e => setExpiresInHours(e.target.value)}
              placeholder="Never"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', height: 38, padding: '0 20px' }} disabled={creating}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>

        {newCode && (
          <div className="invite-result">
            <span className="invite-code-badge">{newCode}</span>
            <button className="btn btn-sm btn-secondary" onClick={() => copyCode(newCode)} style={{ width: 'auto' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Active invites */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Active invites</div>
        {listError && <div className="alert alert-error">{listError}</div>}
        {loadingList ? (
          <div className="table-empty">Loading...</div>
        ) : active.length === 0 ? (
          <div className="table-empty">No active invites</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Uses</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map(inv => {
                const status = inviteStatus(inv)
                const expiry = formatExpiry(inv.expires_at)
                return (
                  <tr key={inv.code}>
                    <td>
                      <button className="code-copy-btn" onClick={() => copyCode(inv.code)} title="Copy">
                        <span className="invite-code-text">{inv.code}</span>
                        <span className="code-copy-icon">⧉</span>
                      </button>
                    </td>
                    <td>
                      <span style={{ color: inv.use_count >= inv.max_uses ? 'var(--warning)' : 'inherit' }}>
                        {inv.use_count} / {inv.max_uses}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{expiry.label}</div>
                      {expiry.remaining && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{expiry.remaining}</div>}
                    </td>
                    <td><span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span></td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger-ghost"
                        style={{ width: 'auto' }}
                        disabled={status !== 'active' || revoking === inv.code}
                        onClick={() => void handleRevoke(inv.code)}
                      >
                        {revoking === inv.code ? '…' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Archive */}
      {archive.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ color: 'var(--text-muted)' }}>Archive</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Uses</th>
                <th>Expired / revoked</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {archive.map(inv => {
                const status = inviteStatus(inv)
                const expiry = formatExpiry(inv.expires_at)
                return (
                  <tr key={inv.code} style={{ opacity: 0.55 }}>
                    <td><span className="invite-code-text">{inv.code}</span></td>
                    <td>{inv.use_count} / {inv.max_uses}</td>
                    <td style={{ fontSize: 13 }}>
                      {inv.revoked_at
                        ? new Date(inv.revoked_at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : expiry.label}
                    </td>
                    <td><span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
