import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { PermissionSetting } from '../api/types'

export default function PermissionsPage() {
  const [seedRoles, setSeedRoles] = useState<string[]>([])
  const [settings, setSettings] = useState<PermissionSetting[]>([])
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api.admin.getPermissionSettings()
      .then(res => {
        setSeedRoles(res.seed_roles)
        setSettings(res.settings)
        setDraft(Object.fromEntries(res.settings.map(setting => [setting.key, setting.roles])))
      })
      .catch(err => setError(err instanceof ApiError ? err.code : String(err)))
  }, [])

  useEffect(() => { load() }, [load])

  const changed = useMemo(() => {
    return settings.some(setting => {
      const before = [...setting.roles].sort().join(',')
      const after = [...(draft[setting.key] ?? [])].sort().join(',')
      return before !== after
    })
  }, [draft, settings])

  function toggleRole(action: string, role: string) {
    setDraft(prev => {
      const current = new Set(prev[action] ?? [])
      current.has(role) ? current.delete(role) : current.add(role)
      return { ...prev, [action]: seedRoles.filter(seed => current.has(seed)) }
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await api.admin.updatePermissionSettings(draft)
      setSeedRoles(res.seed_roles)
      setSettings(res.settings)
      setDraft(Object.fromEntries(res.settings.map(setting => [setting.key, setting.roles])))
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Permissions</h2>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!changed || saving} onClick={() => { void save() }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
      {error && <div className="alert alert-error" onClick={() => setError(null)}>{error} x</div>}

      <div className="card">
        <div className="card-title">Role permissions</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              {seedRoles.map(role => <th key={role}>{role}</th>)}
            </tr>
          </thead>
          <tbody>
            {settings.map(setting => (
              <tr key={setting.key}>
                <td>
                  <div style={{ fontWeight: 700 }}>{setting.label}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{setting.key}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{setting.description}</div>
                </td>
                {seedRoles.map(role => (
                  <td key={role}>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={(draft[setting.key] ?? []).includes(role)}
                        onChange={() => toggleRole(setting.key, role)}
                      />
                      <span>{role}</span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

