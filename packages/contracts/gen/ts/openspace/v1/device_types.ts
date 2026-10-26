// Device, vault, and pairing types for OpenSpace v2.

export type RegistrationPolicy = 'open' | 'invite_code_only' | 'approval_required' | 'closed'

export type ConnectionState =
  | 'discovered'
  | 'not_joined'
  | 'pending_approval'
  | 'joined'
  | 'unavailable'
  | 'revoked'
  | 'failed'

export type DeviceStatus = 'active' | 'pending' | 'revoked'

export type ClientType = 'web' | 'windows' | 'mobile'

export interface DeviceCredential {
  id: string
  server_identity_id: string
  device_public_key: string
  device_status: DeviceStatus
  client_type: ClientType
  created_at: string
  last_seen_at?: string
  revoked_at?: string
}

export interface ServerFeatures {
  text: boolean
  voice: boolean
  files: boolean
  device_pairing: boolean
}

export interface ServerMetadata {
  server_id: string
  name: string
  public_url: string
  registration_policy: RegistrationPolicy
  features: ServerFeatures
  tls_required: boolean
}

export interface ServerEntry {
  server_id: string
  name: string
  url: string
  connection_state: ConnectionState
  device_id?: string
  server_identity_id?: string
  access_token?: string
  added_at: string
}

export interface LocalVaultProfile {
  name: string
  created_at: string
}

export interface VaultData {
  profile: LocalVaultProfile
  servers: ServerEntry[]
}

export interface PairingToken {
  id: string
  server_identity_id: string
  created_by_device_id: string
  scope: string
  expires_at: string
  usage_limit: number
  used_count: number
  status: 'active' | 'used' | 'revoked' | 'suspicious'
}

export interface TransferBundleServer {
  server_id: string
  server_url: string
  pairing_token: string
  display_name: string
}

export interface TransferBundle {
  servers: TransferBundleServer[]
  created_at: string
  expires_at: string
}

export interface RelayTransfer {
  id: string
  expires_at: string
  used_at?: string
  created_at: string
}

// API request/response types

export interface RegistrationChallengeRequest {
  device_public_key: string
  display_name: string
  invite_code?: string | null
  client_type: ClientType
}

export interface RegistrationChallengeResponse {
  challenge_id: string
  nonce: string
}

export interface RegistrationCompleteRequest {
  challenge_id: string
  signature: string
}

export interface RegistrationCompleteResponse {
  server_identity_id: string
  device_id: string
  connection_state: 'joined' | 'pending_approval'
  access_token: string | null
}

export interface RedeemChallengeRequest {
  pairing_token: string
  new_device_public_key: string
  client_type: ClientType
}

export interface RedeemChallengeResponse {
  challenge_id: string
  nonce: string
}

export interface RedeemCompleteRequest {
  challenge_id: string
  signature: string
}

export interface RedeemCompleteResponse {
  server_identity_id: string
  device_id: string
  access_token: string
}

export interface RelayUploadRequest {
  encrypted_bundle: string
  expires_in_seconds: number
}

export interface RelayUploadResponse {
  transfer_id: string
}

export interface RelayDownloadResponse {
  encrypted_bundle: string
}
