import type {
  Identity, Room, Channel, MessagesPage, Message,
  JoinVoiceResponse, Participant, IceServersResponse, TokenResponse,
  DMConversation, DMMessage, DMMessagesPage, Invite, ServerSettings,
  UpdateServerSettingsRequest, PermissionSettingsResponse, IdentitySummary, AttachmentInfo,
} from './types'

const TOKEN_KEY = 'openspace_web_token'
let _apiBase = ''
let _wsBase = ''

export function setActiveServer(apiBase: string, wsBase: string, token: string | null): void {
  _apiBase = apiBase.replace(/\/$/, '')
  _wsBase = wsBase
  if (token) setToken(token)
}

export function clearActiveServer(): void {
  _apiBase = ''
  _wsBase = ''
  clearToken()
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code)
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getActiveWsBase(): string {
  return _wsBase
}

export function hasToken(): boolean {
  return !!getToken()
}

export function uploadToSignedURL(url: string, file: File, signal: AbortSignal, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new ApiError(xhr.status, 'upload_failed'))
    }
    xhr.onerror = () => { cleanup(); reject(new ApiError(0, 'upload_network_error')) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')) }
    xhr.send(file)
  })
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${_apiBase}/api/v1${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => ({ error: 'parse_error' }))

  if (res.status === 401) {
    // Don't clear the token here — the vault holds the authoritative copy and
    // the WS reconnect loop needs it.  Clearing caused a cascade where every
    // subsequent request lost its Authorization header even on transient 401s.
    throw new ApiError(401, data.error ?? 'unauthorized')
  }

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown_error')
  }

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
    permissions: () => request<{ permissions: string[] }>('GET', '/me/permissions'),
    update: (display_name: string, avatar_url = '') =>
      request<Identity>('PATCH', '/me', { display_name, avatar_url }),
  },

  invites: {
    create: (maxUses: number, expiresInHours?: number) =>
      request<Invite>('POST', '/invites', {
        max_uses: maxUses,
        expires_in_hours: expiresInHours || undefined,
      }),
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
  },

  rooms: {
    list: () => request<{ rooms: Room[] }>('GET', '/rooms'),
    get: (id: string) => request<Room>('GET', `/rooms/${id}`),
    create: (name: string, defaultRoomType: 'text' | 'voice', defaultRoomName = 'general') =>
      request<Room>('POST', '/rooms', {
        name,
        default_room_type: defaultRoomType,
        default_room_name: defaultRoomName,
      }),
  },

  channels: {
    list: (roomId: string) => request<{ channels: Channel[] }>('GET', `/rooms/${roomId}/channels`),
    get: (roomId: string, channelId: string) =>
      request<Channel>('GET', `/rooms/${roomId}/channels/${channelId}`),
    create: (roomId: string, name: string, type: 'text' | 'voice') =>
      request<Channel>('POST', `/rooms/${roomId}/channels`, { name, type }),
  },

  messages: {
    list: (roomId: string, channelId: string, before?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return request<MessagesPage>('GET', `/rooms/${roomId}/channels/${channelId}/messages?${params}`)
    },
    send: (roomId: string, channelId: string, content: string, attachmentId?: string) =>
      request<Message>('POST', `/rooms/${roomId}/channels/${channelId}/messages`, { content, attachment_id: attachmentId }),
    delete: (roomId: string, channelId: string, id: string) =>
      request<void>('DELETE', `/rooms/${roomId}/channels/${channelId}/messages/${id}`),
  },

  attachments: {
    requestUpload: (file: File) => request<{ attachment_id: string; upload_url: string; expires_at: string }>('POST', '/attachments/upload-url', {
      filename: file.name, content_type: file.type || 'application/octet-stream', size_bytes: file.size,
    }),
    confirm: (id: string) => request<AttachmentInfo>('POST', `/attachments/${id}/confirm`),
  },

  voice: {
    join: (channelId: string) =>
      request<JoinVoiceResponse>('POST', `/rtc/rooms/${channelId}/join`),
    leave: (channelId: string) =>
      request<void>('POST', `/rtc/rooms/${channelId}/leave`),
    heartbeat: (channelId: string) =>
      request<void>('POST', `/rtc/rooms/${channelId}/heartbeat`),
    updateState: (channelId: string, state: Partial<{ muted: boolean; deafened: boolean; camera_enabled: boolean; screen_sharing: boolean }>) =>
      request<void>('PATCH', `/rtc/rooms/${channelId}/state`, state),
    participants: (channelId: string) =>
      request<{ participants: Participant[] }>('GET', `/rtc/rooms/${channelId}/participants`),
    iceServers: () => request<IceServersResponse>('GET', '/rtc/ice-servers'),
    token: (channelId: string, sources: string[]) =>
      request<TokenResponse>('POST', '/rtc/token', { channel_id: channelId, sources }),
  },

  dm: {
    start: (targetIdentityId: string) =>
      request<DMConversation>('POST', '/dm/conversations', { recipient_id: targetIdentityId }),
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
  social: {
    searchMembers: (query = '') => request<{ members: import('./types').PublicProfile[] }>('GET', `/members?q=${encodeURIComponent(query)}&limit=50`),
    getMember: (id: string) => request<import('./types').PublicProfile>('GET', `/members/${id}`),
    listFriends: () => request<{ relationships: import('./types').PublicProfile[] }>('GET', '/friends'),
    changeFriendship: (id: string, action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock') =>
      request<import('./types').PublicProfile>('POST', `/friends/${id}/${action}`),
  },
}
