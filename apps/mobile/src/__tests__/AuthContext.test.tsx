import React from 'react'
import { render, act, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthProvider, useAuth } from '../context/AuthContext'

// Mock the entire api/client module
jest.mock('../api/client', () => {
  const mockApi = {
    auth: {
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    },
  }
  return {
    api: mockApi,
    setToken: jest.fn().mockResolvedValue(undefined),
    clearToken: jest.fn().mockResolvedValue(undefined),
    hasToken: jest.fn().mockReturnValue(false),
    loadToken: jest.fn().mockResolvedValue(undefined),
    ApiError: class ApiError extends Error {
      code: string
      constructor(status: number, code: string) { super(code); this.code = code }
    },
  }
})

function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth()
  onRender(ctx)
  return <Text>{ctx.isAuthenticated ? 'authenticated' : 'unauthenticated'}</Text>
}

describe('AuthContext', () => {
  beforeEach(() => jest.clearAllMocks())

  it('initializes with isLoading=true and isAuthenticated=false', async () => {
    const { getByText } = render(
      <AuthProvider>
        <TestConsumer onRender={() => {}} />
      </AuthProvider>
    )
    await waitFor(() => expect(getByText('unauthenticated')).toBeTruthy())
  })

  it('sets isAuthenticated=true after successful login', async () => {
    const { api } = require('../api/client')
    api.auth.login.mockResolvedValueOnce({
      token: 'test-token-123',
      identity: { id: 'id1', username: 'user1', display_name: 'User 1', roles: ['member'], is_disabled: false, created_at: '' },
    })

    let authCtx: ReturnType<typeof useAuth> | null = null
    render(
      <AuthProvider>
        <TestConsumer onRender={ctx => { authCtx = ctx }} />
      </AuthProvider>
    )

    await act(async () => { await authCtx!.login('user1', 'pass1') })
    expect(authCtx!.isAuthenticated).toBe(true)
    expect(authCtx!.identity?.username).toBe('user1')
  })

  it('throws on login failure', async () => {
    const { api, ApiError } = require('../api/client')
    api.auth.login.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials'))

    let authCtx: ReturnType<typeof useAuth> | null = null
    render(
      <AuthProvider>
        <TestConsumer onRender={ctx => { authCtx = ctx }} />
      </AuthProvider>
    )

    await expect(
      act(async () => { await authCtx!.login('user1', 'wrongpass') })
    ).rejects.toThrow()
  })

  it('clears identity and token on logout', async () => {
    const { api } = require('../api/client')
    api.auth.login.mockResolvedValueOnce({
      token: 'test-token',
      identity: { id: 'id1', username: 'user1', display_name: 'User 1', roles: [], is_disabled: false, created_at: '' },
    })
    api.auth.logout.mockResolvedValueOnce(undefined)

    let authCtx: ReturnType<typeof useAuth> | null = null
    render(
      <AuthProvider>
        <TestConsumer onRender={ctx => { authCtx = ctx }} />
      </AuthProvider>
    )

    await act(async () => { await authCtx!.login('user1', 'pass1') })
    expect(authCtx!.isAuthenticated).toBe(true)

    await act(async () => { await authCtx!.logout() })
    expect(authCtx!.isAuthenticated).toBe(false)
    expect(authCtx!.identity).toBeNull()
  })

  it('sets isAuthenticated=true after successful register', async () => {
    const { api } = require('../api/client')
    api.auth.register.mockResolvedValueOnce({
      token: 'reg-token',
      identity: { id: 'id2', username: 'newuser', display_name: 'New', roles: ['member'], is_disabled: false, created_at: '' },
    })

    let authCtx: ReturnType<typeof useAuth> | null = null
    render(
      <AuthProvider>
        <TestConsumer onRender={ctx => { authCtx = ctx }} />
      </AuthProvider>
    )

    await act(async () => { await authCtx!.register('newuser', 'pass', 'New', 'invite123') })
    expect(authCtx!.isAuthenticated).toBe(true)
    expect(authCtx!.identity?.username).toBe('newuser')
  })
})
