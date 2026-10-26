import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { api } from './api/client'
import Layout from './components/Layout'
import BootstrapPage from './pages/BootstrapPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import IdentitiesPage from './pages/IdentitiesPage'
import RoomsPage from './pages/RoomsPage'
import InvitesPage from './pages/InvitesPage'
import SettingsPage from './pages/SettingsPage'
import PermissionsPage from './pages/PermissionsPage'

type AppState = 'loading' | 'needs-bootstrap' | 'needs-login' | 'ready'

function AppRouter() {
  const { token } = useAuth()
  const [state, setState] = useState<AppState>('loading')

  useEffect(() => {
    api.bootstrap.status()
      .then(res => {
        if (!res.bootstrapped) {
          setState('needs-bootstrap')
        } else if (!token) {
          setState('needs-login')
        } else {
          setState('ready')
        }
      })
      .catch(() => setState('needs-login'))
  }, [token])

  if (state === 'loading') {
    return <div className="loading">Loading…</div>
  }

  if (state === 'needs-bootstrap') {
    return <BootstrapPage onDone={() => setState('ready')} />
  }

  if (state === 'needs-login') {
    return <LoginPage onDone={() => setState('ready')} />
  }

  return (
    <BrowserRouter basename="/admin">
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/identities" element={<IdentitiesPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/invites" element={<InvitesPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
