import React, { useState, FormEvent } from 'react'
import { useVault } from '../context/VaultContext'
import PasswordField from '../components/PasswordField'

export default function UnlockVaultPage() {
  const { unlock, recover } = useVault()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await unlock(password)
    } catch {
      setError('Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecovery(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    setError(null); setLoading(true)
    try { await recover(recoveryCode, newPassword) }
    catch { setError('Recovery code is invalid or the local vault is damaged') }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>{recovering ? 'Recover profile' : 'Unlock profile'}</h1>
        <p className="auth-subtitle">{recovering ? 'Use the saved recovery code to set a new local password.' : 'Enter the password for your local profile.'}</p>
        {error && <div className="alert alert-error">{error}</div>}
        {!recovering ? <form onSubmit={e => { void handleSubmit(e) }}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordField
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setRecovering(true); setError(null) }}>Forgot password?</button>
        </form> : <form onSubmit={e => { void handleRecovery(e) }}>
          <div className="field"><label htmlFor="recovery-code">Recovery code</label><textarea id="recovery-code" value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} autoFocus rows={3} /></div>
          <div className="field"><label htmlFor="new-password">New password</label><PasswordField id="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
          <button type="submit" className="btn btn-primary" disabled={loading || !recoveryCode.trim() || newPassword.length < 8}>{loading ? 'Recovering...' : 'Recover and unlock'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setRecovering(false); setError(null) }}>Back to password</button>
        </form>}
      </div>
    </div>
  )
}
