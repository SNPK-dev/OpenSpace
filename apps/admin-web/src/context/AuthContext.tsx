import React, { createContext, useContext, useState, useCallback } from 'react'
import { api, setToken, clearToken, hasToken } from '../api/client'

interface AuthState {
  token: boolean
  username: string
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<boolean>(hasToken)
  const [username, setUsername] = useState<string>('')

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    setToken(res.token)
    setTokenState(true)
    setUsername(username)
  }, [])

  const logout = useCallback(async () => {
    try { await api.auth.logout() } catch { /* ignore */ }
    clearToken()
    setTokenState(false)
    setUsername('')
  }, [])

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
