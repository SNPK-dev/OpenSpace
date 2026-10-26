import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VaultProvider, useVault } from './context/VaultContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { WSProvider } from './context/WSContext'
import OnboardingPage from './pages/OnboardingPage'
import CreateProfilePage from './pages/CreateProfilePage'
import UnlockVaultPage from './pages/UnlockVaultPage'
import PairDevicePage from './pages/PairDevicePage'
import MainLayout from './components/MainLayout'

function AppRoutes() {
  const { status, servers, selectedServerId } = useVault()
  const { setAuth, isAuthenticated } = useAuth()

  // Extract only the access token string so the effect fires only when the
  // token itself changes — not on every connectivity/metadata update.
  const activeToken = (
    selectedServerId
      ? servers.find(s => s.server_id === selectedServerId && s.access_token)
      : servers.find(s => s.connection_state === 'joined' && s.access_token)
  )?.access_token ?? null

  useEffect(() => {
    if (status !== 'unlocked' || !activeToken) return
    void setAuth(activeToken)
  }, [status, activeToken, setAuth])

  if (status === 'loading') {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Loading vault</h1>
          <p className="auth-subtitle">Checking local encrypted profile...</p>
        </div>
      </div>
    )
  }

  if (status === 'no_vault') {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/onboarding/create-profile" element={<CreateProfilePage />} />
        <Route path="/onboarding/pair-device" element={<PairDevicePage />} />
        <Route path="/*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  if (status === 'locked') {
    return (
      <Routes>
        <Route path="/unlock" element={<UnlockVaultPage />} />
        <Route path="/*" element={<Navigate to="/unlock" replace />} />
      </Routes>
    )
  }

  // Vault unlocked — always show main app; ServerRail handles empty/no-server state
  // key forces WSProvider remount (fresh WS connection) whenever the active server changes
  const hasJoinedServer = servers.some(s => s.connection_state === 'joined' && !!s.access_token)
  return (
    <WSProvider key={selectedServerId ?? 'none'} enabled={hasJoinedServer || isAuthenticated}>
      <Routes>
        <Route path="/onboarding/pair-device" element={<PairDevicePage />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </WSProvider>
  )
}

export default function App() {
  return (
    <VaultProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </VaultProvider>
  )
}
