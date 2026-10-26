export interface BootstrapRequest {
  server_name: string
  server_description?: string
  server_public_url?: string
  server_avatar_url?: string
  admin_username: string
  admin_email: string
  admin_password: string
}

export interface BootstrapResponse {
  server_id: string
  identity_id: string
  token: string
}

export interface LoginResponse {
  token: string
  identity: { id: string; username: string; roles: string[] }
}

export interface Profile {
  id: string
  username: string
  display_name: string
  email: string | null
  roles: string[]
}

export interface IdentitySummary {
  id: string
  username: string
  display_name: string
  email: string | null
  is_disabled: boolean
  roles: string[]
}

export interface ServerSettings {
  server_id: string
  name: string
  description: string | null
  public_url: string | null
  avatar_url: string | null
  updated_at: string
}

export interface UpdateServerSettingsRequest {
  name: string
  description?: string
  public_url?: string
  avatar_url?: string
}

export interface PermissionSetting {
  key: string
  label: string
  description: string
  roles: string[]
  default_roles: string[]
}

export interface PermissionSettingsResponse {
  seed_roles: string[]
  settings: PermissionSetting[]
}

export interface Room {
  id: string
  name: string
  description: string | null
  room_type: 'text' | 'voice'
  position: number
  created_at: string
}

export interface Channel {
  id: string
  room_id: string
  name: string
  type: 'text' | 'voice'
  position: number
  created_at: string
}

export interface Invite {
  code: string
  expires_at: string | null
}

export interface InviteDetail {
  code: string
  max_uses: number
  use_count: number
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface RtcStats {
  voice_rooms_active: number
  voice_participants_total: number
  counters: {
    tokens_issued: number
    ice_served: number
    voice_joins: number
    voice_leaves: number
    voice_heartbeats: number
    voice_evictions: number
  }
}
