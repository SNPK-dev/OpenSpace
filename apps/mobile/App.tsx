import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { WSProvider } from './src/context/WSContext'
import RootNavigator from './src/navigation/RootNavigator'

function AppInner() {
  const { isAuthenticated } = useAuth()
  return (
    <WSProvider enabled={isAuthenticated}>
      <StatusBar style="light" />
      <RootNavigator />
    </WSProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
