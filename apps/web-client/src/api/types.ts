export interface Identity {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  email?: string | null
  roles: string[]
  is_disabled: boolean
  created_at: string
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

export interface Invite {
  code: string
  expires_at: string | null
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

export interface Sender {
  id: string
  username: string
  display_name: string
}

export interface Message {
  id: string
  channel_id: string
  sender: Sender
  content: string
  attachment?: AttachmentInfo
  created_at: string
}

export interface AttachmentInfo {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  url: string
}

export interface MessagesPage {
  messages: Message[]
  has_more: boolean
}

export interface Participant {
  id: string
  username: string
  display_name: string
  muted: boolean
  deafened: boolean
  camera_enabled: boolean
  screen_sharing: boolean
}

export interface JoinVoiceResponse {
  participant: Participant
  participants: Participant[]
}

export interface IceServer {
  urls: string[]
  username?: string
  credential?: string
}

export interface IceServersResponse {
  ice_servers: IceServer[]
}

export interface TokenResponse {
  token: string
  url: string
  identity: string // unique LK identity for this session (identityID + session suffix)
}

export interface DMConversation {
  id: string
  peer: Sender
  created_at: string
}

export interface DMMessage {
  id: string
  conversation_id: string
  sender: Sender
  content: string
  created_at: string
}

export interface DMMessagesPage {
  messages: DMMessage[]
  has_more: boolean
}

export type RelationshipState = 'none' | 'pending' | 'accepted' | 'blocked'

export interface PublicProfile {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  roles: string[]
  relationship: RelationshipState
  relationship_direction?: 'incoming' | 'outgoing'
}

// WebSocket events
export interface WSEvent {
  type: string
  [key: string]: unknown
}

export interface MessageCreatedEvent extends WSEvent {
  type: 'message.created'
  channel_id: string
  message: Message
}

export interface MessageDeletedEvent extends WSEvent {
  type: 'message.deleted'
  channel_id: string
  message_id: string
}

export interface VoiceJoinedEvent extends WSEvent {
  type: 'voice.joined'
  channel_id: string
  participant: Participant
}

export interface VoiceLeftEvent extends WSEvent {
  type: 'voice.left'
  channel_id: string
  identity_id: string
}

export interface VoiceStateChangedEvent extends WSEvent {
  type: 'voice.state_changed'
  channel_id: string
  participant: Participant
}

export interface DMMessageCreatedEvent extends WSEvent {
  type: 'dm.message.created'
  conversation_id: string
  message: DMMessage
}

export interface PresenceJoinedEvent extends WSEvent {
  type: 'presence.joined'
  identity_id: string
}

export interface PresenceLeftEvent extends WSEvent {
  type: 'presence.left'
  identity_id: string
}

export interface RoomCreatedEvent extends WSEvent {
  type: 'room.created'
  room: Room
}
