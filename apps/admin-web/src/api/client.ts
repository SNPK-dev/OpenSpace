import type {
  BootstrapRequest, BootstrapResponse, LoginResponse,
  Profile, IdentitySummary, Room, Channel, Invite, InviteDetail, RtcStats,
  ServerSettings, UpdateServerSettingsRequest, PermissionSettingsResponse,
} from './types'

const BASE = '/api/v1'
const TOKEN_KEY = 'openspace_token'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code)
    this.name = 'ApiError'
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function hasToken(): boolean {
  return localStorage.getItem(TOKEN_KEY) !== null
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  if (res.status === 204) return undefined as T

  const payload = await res.json().catch(() => ({ error: 'unknown' })) as { error?: string }

  if (res.status === 401) {
    const hadToken = !!getToken()
    clearToken()
    if (hadToken) window.location.href = '/login'
    throw new ApiError(401, payload.error ?? 'unauthorized')
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload.error ?? 'unknown')
  }

  return payload as T
}

export const api = {
  bootstrap: {
    status: () =>
      request<{ bootstrapped: boolean }>('GET', '/bootstrap/status'),
    setup: (body: BootstrapRequest) =>
      request<BootstrapResponse>('POST', '/bootstrap', body),
  },

  auth: {
    login: (username: string, password: string) =>
      request<LoginResponse>('POST', '/auth/login', { username, password }),
    logout: () => request<void>('POST', '/auth/logout'),
    me: () => request<Profile>('GET', '/me'),
  },

  admin: {
    getServerSettings: () =>
      request<ServerSettings>('GET', '/admin/server-settings'),
    updateServerSettings: (body: UpdateServerSettingsRequest) =>
      request<ServerSettings>('PATCH', '/admin/server-settings', body),
    getPermissionSettings: () =>
      request<PermissionSettingsResponse>('GET', '/admin/permission-settings'),
    updatePermissionSettings: (settings: Record<string, string[]>) =>
      request<PermissionSettingsResponse>('PATCH', '/admin/permission-settings', { settings }),
    listIdentities: () =>
      request<IdentitySummary[]>('GET', '/admin/identities'),
    assignRole: (id: string, role: string) =>
      request<void>('POST', `/admin/identities/${id}/roles`, { role }),
    revokeRole: (id: string, role: string) =>
      request<void>('DELETE', `/admin/identities/${id}/roles/${role}`),
    disableIdentity: (id: string) =>
      request<void>('POST', `/admin/identities/${id}/disable`),
    enableIdentity: (id: string) =>
      request<void>('POST', `/admin/identities/${id}/enable`),
  },

  rooms: {
    list: () => request<{ rooms: Room[] }>('GET', '/rooms').then(r => r.rooms),
    create: (name: string, defaultRoomType: 'text' | 'voice', description?: string, defaultRoomName?: string) =>
      request<Room>('POST', '/rooms', {
        name,
        default_room_type: defaultRoomType,
        default_room_name: defaultRoomName || undefined,
        description: description || undefined,
      }),
    delete: (id: string) => request<void>('DELETE', `/rooms/${id}`),
  },

  channels: {
    list: (roomId: string) =>
      request<{ channels: Channel[] }>('GET', `/rooms/${roomId}/channels`).then(r => r.channels),
    create: (roomId: string, name: string, type: 'text' | 'voice') =>
      request<Channel>('POST', `/rooms/${roomId}/channels`, { name, type }),
    delete: (roomId: string, channelId: string) =>
      request<void>('DELETE', `/rooms/${roomId}/channels/${channelId}`),
  },

  invites: {
    create: (maxUses: number, expiresInHours?: number) =>
      request<Invite>('POST', '/invites', {
        max_uses: maxUses,
        expires_in_hours: expiresInHours || undefined,
      }),
    list: () => request<{ invites: InviteDetail[] }>('GET', '/invites').then(r => r.invites),
    revoke: (code: string) => request<void>('DELETE', `/invites/${code}`),
  },

  rtc: {
    stats: () => request<RtcStats>('GET', '/rtc/stats'),
  },
}
