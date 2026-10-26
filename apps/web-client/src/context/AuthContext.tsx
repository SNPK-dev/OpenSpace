import React, { createContext, useContext, useState, useCallback } from 'react'
import { api, setToken, clearToken } from '../api/client'
import type { Identity } from '../api/types'

interface AuthState {
  identity: Identity | null
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, displayName: string, inviteCode: string) => Promise<void>
  logout: () => Promise<void>
  setIdentity: (identity: Identity) => void
  setAuth: (token: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Start unauthenticated — identity is restored by setAuth() once the vault
  // unlocks and VaultContext calls activateServer (which sets _apiBase).
  // We intentionally do NOT pre-fetch /me here because _apiBase is empty
  // until the vault is unlocked, so the request would target the wrong origin
  // and clear the token prematurely.
  const [state, setState] = useState<AuthState>({
    identity: null,
    isAuthenticated: false,
  })

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    setToken(res.token)
    setState({ identity: res.identity, isAuthenticated: true })
  }, [])

  const register = useCallback(async (username: string, password: string, displayName: string, inviteCode: string) => {
    const res = await api.auth.register(username, password, displayName, inviteCode)
    setToken(res.token)
    setState({ identity: res.identity, isAuthenticated: true })
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {/* ignore */})
    clearToken()
    setState({ identity: null, isAuthenticated: false })
  }, [])

  const setIdentity = useCallback((identity: Identity) => {
    setState(s => ({ ...s, identity }))
  }, [])

  const setAuth = useCallback(async (token: string) => {
    setToken(token)
    try {
      const identity = await api.me.get()
      setState({ identity, isAuthenticated: true })
    } catch {
      // Don't clear the token on failure — the vault is the authoritative source.
      // A transient 401 (server restart, brief outage) should not permanently
      // destroy the session; the next reconnect attempt will restore it.
      setState({ identity: null, isAuthenticated: false })
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, setIdentity, setAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
