import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, setToken, clearToken, hasToken, loadToken } from '../api/client'
import type { Identity } from '../api/types'

interface AuthState {
  identity: Identity | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName: string, inviteCode: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    identity: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // Restore token from AsyncStorage on mount
  useEffect(() => {
    void loadToken().then(() => {
      setState(s => ({ ...s, isAuthenticated: hasToken(), isLoading: false }))
    })
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    await setToken(res.token)
    setState({ identity: res.identity, isAuthenticated: true, isLoading: false })
  }, [])

  const register = useCallback(async (username: string, password: string, displayName: string, inviteCode: string) => {
    const res = await api.auth.register(username, password, displayName, inviteCode)
    await setToken(res.token)
    setState({ identity: res.identity, isAuthenticated: true, isLoading: false })
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {/* ignore */})
    await clearToken()
    setState({ identity: null, isAuthenticated: false, isLoading: false })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
