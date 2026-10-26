import React, { useState, FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'
import PasswordField from '../components/PasswordField'

interface Props {
  onDone: () => void
}

export default function LoginPage({ onDone }: Props) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username.trim(), password)
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Invalid username or password' : err.code)
      } else {
        setError('Unexpected error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>OpenSpace Admin</h1>
        <p className="auth-subtitle">Sign in with your admin account.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={e => { void handleSubmit(e) }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordField
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
