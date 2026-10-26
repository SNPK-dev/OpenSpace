export interface Identity {
  id: string
  username: string
  display_name: string
  roles: string[]
  is_disabled: boolean
  created_at: string
}

export interface Room {
  id: string
  name: string
  description: string
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
  created_at: string
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
  livekit_url: string
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
