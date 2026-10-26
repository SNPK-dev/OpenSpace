import React, { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../api/client'
import type { IdentitySummary } from '../api/types'

const ROLES = ['owner', 'admin', 'moderator', 'member', 'guest']

export default function IdentitiesPage() {
  const [identities, setIdentities] = useState<IdentitySummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api.admin.listIdentities()
      .then(items => setIdentities(items.map(item => ({
        ...item,
        roles: Array.isArray(item.roles) ? item.roles : [],
      }))))
      .catch(err => setError(String(err)))
  }, [])

  useEffect(() => { load() }, [load])

  async function assignRole(id: string, role: string) {
    setBusy(id)
    try {
      await api.admin.assignRole(id, role)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function revokeRole(id: string, role: string) {
    setBusy(`${id}-${role}`)
    try {
      await api.admin.revokeRole(id, role)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function toggleDisabled(identity: IdentitySummary) {
    setBusy(`toggle-${identity.id}`)
    try {
      if (identity.is_disabled) {
        await api.admin.enableIdentity(identity.id)
      } else {
        await api.admin.disableIdentity(identity.id)
      }
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <h2>Identities</h2>
      {error && <div className="alert alert-error" onClick={() => setError(null)}>{error} ✕</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Display name</th>
            <th>Email</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {identities.map(identity => (
            <tr key={identity.id} className={identity.is_disabled ? 'row-disabled' : ''}>
              <td><code>{identity.username}</code></td>
              <td>{identity.display_name}</td>
              <td>{identity.email ?? '—'}</td>
              <td>
                <div className="role-list">
                  {(identity.roles ?? []).map(role => (
                    <span key={role} className="role-badge">
                      {role}
                      {role !== 'owner' && (
                        <button
                          className="role-revoke"
                          title={`Revoke ${role}`}
                          disabled={busy === `${identity.id}-${role}`}
                          onClick={() => { void revokeRole(identity.id, role) }}
                        >×</button>
                      )}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <span className={`badge ${identity.is_disabled ? 'badge-red' : 'badge-green'}`}>
                  {identity.is_disabled ? 'Disabled' : 'Active'}
                </span>
              </td>
              <td>
                <div className="action-row">
                  <select
                    className="role-select"
                    defaultValue=""
                    disabled={busy === identity.id}
                    onChange={e => {
                      if (e.target.value) {
                        void assignRole(identity.id, e.target.value)
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>Add role…</option>
                    {ROLES.filter(r => !(identity.roles ?? []).includes(r)).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    className={`btn btn-sm ${identity.is_disabled ? 'btn-success' : 'btn-danger'}`}
                    disabled={busy === `toggle-${identity.id}`}
                    onClick={() => { void toggleDisabled(identity) }}
                  >
                    {identity.is_disabled ? 'Enable' : 'Disable'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
