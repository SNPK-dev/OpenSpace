import React, { FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { ServerSettings, UpdateServerSettingsRequest } from '../api/types'
import ServerAvatarField from '../components/ServerAvatarField'

export default function SettingsPage() {
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.admin.getServerSettings()
      .then(next => {
        setSettings(next)
        setName(next.name)
        setDescription(next.description ?? '')
        setPublicUrl(next.public_url ?? '')
        setAvatarUrl(next.avatar_url ?? '')
      })
      .catch(err => setError(err instanceof ApiError ? err.code : String(err)))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const payload: UpdateServerSettingsRequest = {
        name: name.trim(),
      }
      const nextDescription = description.trim()
      const nextPublicUrl = publicUrl.trim()
      const nextAvatarUrl = avatarUrl.trim()
      if (nextDescription) payload.description = nextDescription
      if (nextPublicUrl) payload.public_url = nextPublicUrl
      if (nextAvatarUrl) payload.avatar_url = nextAvatarUrl

      const next = await api.admin.updateServerSettings(payload)
      setSettings(next)
      setName(next.name)
      setDescription(next.description ?? '')
      setPublicUrl(next.public_url ?? '')
      setAvatarUrl(next.avatar_url ?? '')
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Server settings</h2>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Settings saved</div>}
      {loading && <div className="loading">Loading settings...</div>}

      {!loading && (
        <form className="settings-form" onSubmit={e => { void handleSubmit(e) }}>
          <div className="card">
            <div className="card-title">Profile</div>
            <div className="settings-grid">
              <div className="settings-fields">
                <div className="field">
                  <label htmlFor="settings_name">Server name</label>
                  <input
                    id="settings_name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={100}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="settings_description">Description</label>
                  <textarea
                    id="settings_description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    maxLength={500}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="settings_public_url">Public URL</label>
                  <input
                    id="settings_public_url"
                    type="text"
                    value={publicUrl}
                    onChange={e => setPublicUrl(e.target.value)}
                    placeholder="https://space.example.com"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="settings-avatar">
                <div className="field">
                  <label htmlFor="server_avatar_url">Server avatar</label>
                  <ServerAvatarField value={avatarUrl} onChange={setAvatarUrl} disabled={saving} />
                </div>
              </div>
            </div>
            <div className="settings-meta">
              {settings && <span>Updated {new Date(settings.updated_at).toLocaleString()}</span>}
            </div>
          </div>

          <div className="action-row">
            <button type="submit" className="btn btn-primary" disabled={saving || name.trim() === ''}>
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
