import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VaultProvider, useVault } from './context/VaultContext'
import { WSProvider } from './context/WSContext'
import OnboardingPage from './pages/OnboardingPage'
import CreateProfilePage from './pages/CreateProfilePage'
import UnlockVaultPage from './pages/UnlockVaultPage'
import PairDevicePage from './pages/PairDevicePage'
import MainLayout from './components/MainLayout'

function AppRoutes() {
  const { status, selectedServerId } = useVault()

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

  // Vault unlocked — show main app; ServerRail handles no-server empty state
  // key forces WSProvider remount (fresh WS connection) whenever the active server changes
  return (
    <WSProvider key={selectedServerId ?? 'none'} enabled={!!selectedServerId}>
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
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </VaultProvider>
  )
}
