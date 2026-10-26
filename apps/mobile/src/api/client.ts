import AsyncStorage from '@react-native-async-storage/async-storage'
import type {
  Identity, Room, Channel, MessagesPage, Message,
  JoinVoiceResponse, Participant, IceServersResponse, TokenResponse,
  DMConversation, DMMessage, DMMessagesPage,
} from './types'

const TOKEN_KEY = 'openspace_token'

// Use env var if set; fall back to localhost for dev
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080') + '/api/v1'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code)
  }
}

let _token: string | null = null

export async function loadToken(): Promise<void> {
  _token = await AsyncStorage.getItem(TOKEN_KEY)
}

export async function setToken(token: string): Promise<void> {
  _token = token
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  _token = null
  await AsyncStorage.removeItem(TOKEN_KEY)
}

export function getToken(): string | null {
  return _token
}

export function hasToken(): boolean {
  return !!_token
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    await clearToken()
    throw new ApiError(401, 'unauthorized')
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({ error: 'parse_error' }))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'unknown_error')
  return data as T
}

export const api = {
  realtime: {
    ticket: () => request<{ ticket: string; expires_in: number }>('POST', '/realtime/ticket'),
  },
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string; identity: Identity }>('POST', '/auth/login', { username, password }),
    register: (username: string, password: string, display_name: string, invite_code: string) =>
      request<{ token: string; identity: Identity }>('POST', '/auth/register', { username, password, display_name, invite_code }),
    logout: () => request<void>('POST', '/auth/logout'),
    sessions: () => request<{ sessions: Array<{ id: string; created_at: string; expires_at: string; current: boolean }> }>('GET', '/auth/sessions'),
    revokeSession: (id: string) => request<void>('DELETE', `/auth/sessions/${id}`),
  },

  me: {
    get: () => request<Identity>('GET', '/me'),
  },

  rooms: {
    list: () => request<{ rooms: Room[] }>('GET', '/rooms'),
  },

  channels: {
    list: (roomId: string) => request<{ channels: Channel[] }>('GET', `/rooms/${roomId}/channels`),
    get: (roomId: string, channelId: string) =>
      request<Channel>('GET', `/rooms/${roomId}/channels/${channelId}`),
  },

  messages: {
    list: (roomId: string, channelId: string, before?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return request<MessagesPage>('GET', `/rooms/${roomId}/channels/${channelId}/messages?${params}`)
    },
    send: (roomId: string, channelId: string, content: string) =>
      request<Message>('POST', `/rooms/${roomId}/channels/${channelId}/messages`, { content }),
    delete: (roomId: string, channelId: string, id: string) =>
      request<void>('DELETE', `/rooms/${roomId}/channels/${channelId}/messages/${id}`),
  },

  voice: {
    join: (channelId: string) =>
      request<JoinVoiceResponse>('POST', `/rtc/rooms/${channelId}/join`),
    leave: (channelId: string) =>
      request<void>('POST', `/rtc/rooms/${channelId}/leave`),
    heartbeat: (channelId: string) =>
      request<void>('POST', `/rtc/rooms/${channelId}/heartbeat`),
    updateState: (channelId: string, state: Partial<{ muted: boolean; deafened: boolean; camera_enabled: boolean; screen_sharing: boolean }>) =>
      request<Participant>('PATCH', `/rtc/rooms/${channelId}/state`, state),
    participants: (channelId: string) =>
      request<{ participants: Participant[] }>('GET', `/rtc/rooms/${channelId}/participants`),
    iceServers: () => request<IceServersResponse>('GET', '/rtc/ice-servers'),
    token: (channelId: string, sources: string[]) =>
      request<TokenResponse>('POST', '/rtc/token', { channel_id: channelId, sources }),
  },

  dm: {
    start: (targetIdentityId: string) =>
      request<DMConversation>('POST', '/dm/conversations', { target_identity_id: targetIdentityId }),
    listConversations: () =>
      request<{ conversations: DMConversation[] }>('GET', '/dm/conversations'),
    send: (convId: string, content: string) =>
      request<DMMessage>('POST', `/dm/conversations/${convId}/messages`, { content }),
    list: (convId: string, before?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return request<DMMessagesPage>('GET', `/dm/conversations/${convId}/messages?${params}`)
    },
    delete: (convId: string, msgId: string) =>
      request<void>('DELETE', `/dm/conversations/${convId}/messages/${msgId}`),
  },
}
