import React, { useState, FormEvent } from 'react'
import { api, setToken } from '../api/client'
import { ApiError } from '../api/client'
import type { BootstrapRequest } from '../api/types'
import PasswordField from '../components/PasswordField'
import ServerAvatarField from '../components/ServerAvatarField'

interface Props {
  onDone: () => void
}

export default function BootstrapPage({ onDone }: Props) {
  const [serverName, setServerName] = useState('')
  const [serverDescription, setServerDescription] = useState('')
  const [serverPublicUrl, setServerPublicUrl] = useState('')
  const [serverAvatarUrl, setServerAvatarUrl] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload: BootstrapRequest = {
        server_name: serverName.trim(),
        admin_username: username.trim(),
        admin_email: email.trim(),
        admin_password: password,
      }
      const description = serverDescription.trim()
      const publicUrl = serverPublicUrl.trim()
      const avatarUrl = serverAvatarUrl.trim()
      if (description) payload.server_description = description
      if (publicUrl) payload.server_public_url = publicUrl
      if (avatarUrl) payload.server_avatar_url = avatarUrl

      const res = await api.bootstrap.setup(payload)
      setToken(res.token)
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code)
      } else {
        setError('Unexpected error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card auth-card-wide">
        <h1>Set up your OpenSpace server</h1>
        <p className="auth-subtitle">This runs once to create your server and admin account.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={e => { void handleSubmit(e) }}>
          <div className="field">
            <label htmlFor="server_name">Server name</label>
            <input
              id="server_name"
              type="text"
              value={serverName}
              onChange={e => setServerName(e.target.value)}
              placeholder="My Community"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="server_description">Description</label>
            <textarea
              id="server_description"
              value={serverDescription}
              onChange={e => setServerDescription(e.target.value)}
              placeholder="Private team workspace"
              maxLength={500}
            />
          </div>
          <div className="field">
            <label htmlFor="server_public_url">Public URL</label>
            <input
              id="server_public_url"
              type="text"
              value={serverPublicUrl}
              onChange={e => setServerPublicUrl(e.target.value)}
              placeholder="https://space.example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="server_avatar_url">Server avatar</label>
            <ServerAvatarField value={serverAvatarUrl} onChange={setServerAvatarUrl} disabled={loading} />
          </div>
          <div className="field">
            <label htmlFor="username">Admin username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Admin email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordField
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Setting up…' : 'Set up server'}
          </button>
        </form>
      </div>
    </div>
  )
}
