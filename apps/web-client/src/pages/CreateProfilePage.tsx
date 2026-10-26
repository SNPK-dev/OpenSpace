import React, { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVault } from '../context/VaultContext'

type Step = 'form' | 'recovery'

export default function CreateProfilePage() {
  const { createNewVault } = useVault()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Enter a profile name'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== repeat) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const { recoveryCode: rc } = await createNewVault(name.trim(), password)
      setRecoveryCode(rc)
      setStep('recovery')
    } catch (err) {
      setError('Failed to create profile')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleConfirmRecovery() {
    if (!confirmed) { setError('Confirm that you saved the recovery code'); return }
    void navigate('/', { replace: true })
  }

  if (step === 'recovery') {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Recovery code</h1>
          <p className="auth-subtitle">
            Save this code. It can restore access to the profile on this device
            if you forget the password. The code is not stored on the server and cannot be recovered.
          </p>
          <div className="recovery-code-box">
            <code>{recoveryCode}</code>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />
            I saved the recovery code in a safe place
          </label>
          <button className="btn btn-primary" onClick={handleConfirmRecovery}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Create local profile</h1>
        <p className="auth-subtitle">
          The profile is stored only on this device. No email is required.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={e => { void handleCreate(e) }}>
          <div className="field">
            <label htmlFor="profile-name">Profile name</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              placeholder="For example: Alice"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="field">
            <label htmlFor="repeat">Repeat password</label>
            <input
              id="repeat"
              type="password"
              value={repeat}
              onChange={e => setRepeat(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create profile'}
          </button>
        </form>
      </div>
    </div>
  )
}
