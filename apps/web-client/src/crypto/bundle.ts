// Encrypts and decrypts Device Pairing transfer bundles using AES-GCM.
// The decrypt key is placed ONLY in the URL fragment — never sent to the relay.

export interface TransferBundleServer {
  server_id: string
  server_url: string
  pairing_token: string
  display_name: string
  avatar_url?: string | undefined
}

export interface TransferBundle {
  servers: TransferBundleServer[]
  created_at: string
  expires_at: string
}

export interface EncryptedBundle {
  ciphertext: string   // base64
  iv: string           // base64
}

export async function encryptBundle(bundle: TransferBundle): Promise<{ encrypted: EncryptedBundle; keyBase64: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext))

  const rawKey = await crypto.subtle.exportKey('raw', key)
  const keyBase64 = toBase64url(new Uint8Array(rawKey))

  return {
    encrypted: {
      ciphertext: toBase64(new Uint8Array(ciphertext)),
      iv: toBase64(iv),
    },
    keyBase64,
  }
}

export async function decryptBundle(encrypted: EncryptedBundle, keyBase64: string): Promise<TransferBundle> {
  const rawKey = fromBase64url(keyBase64)
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(rawKey), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const iv = fromBase64(encrypted.iv)
  const ciphertext = fromBase64(encrypted.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext))
  return JSON.parse(new TextDecoder().decode(plaintext)) as TransferBundle
}

// Serializes EncryptedBundle for relay transmission (JSON string)
export function serializeBundle(encrypted: EncryptedBundle): string {
  return JSON.stringify(encrypted)
}

export function deserializeBundle(raw: string): EncryptedBundle {
  return JSON.parse(raw) as EncryptedBundle
}

function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function toBase64url(buf: Uint8Array): string {
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((s.length + 3) % 4)
  return fromBase64(padded)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
