import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RtcStats } from '../api/types'

export default function DashboardPage() {
  const [stats, setStats] = useState<RtcStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.rtc.stats()
      .then(setStats)
      .catch(err => setError(String(err)))
  }, [])

  return (
    <div className="page">
      <h2>Dashboard</h2>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.voice_rooms_active}</div>
              <div className="stat-label">Active voice rooms</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.voice_participants_total}</div>
              <div className="stat-label">Voice participants</div>
            </div>
          </div>

          <h3>Event counters (since last restart)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.counters).map(([key, val]) => (
                <tr key={key}>
                  <td>{key.replace(/_/g, ' ')}</td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!stats && !error && <div className="loading">Loading stats…</div>}
    </div>
  )
}
