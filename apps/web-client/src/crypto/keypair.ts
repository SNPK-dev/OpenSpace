// ECDSA P-256 device keypair management using WebCrypto.
// Private key is stored in IndexedDB as non-extractable CryptoKey.
// Public key is exported as SPKI (base64url) for server transmission.

const KEYPAIR_DB = 'openspace_device_keys'
const KEYPAIR_STORE = 'keypairs'

// Vault-lock guard: keypair operations are only permitted when the vault is unlocked.
//
// MVP approach: module-level boolean toggled by VaultContext on lock/unlock.
// Known limitation: this is a convention, not a capability. A future hardening
// pass should replace this with an UnlockedVaultSession capability object that
// owns signChallenge() and getOrCreateDeviceKeypair() — so the operations are
// only reachable through a reference that only exists while the vault is open.
// Track in: security hardening follow-up / post-MVP.
let _vaultUnlocked = false

export function setVaultUnlocked(unlocked: boolean): void {
  _vaultUnlocked = unlocked
}

function assertVaultUnlocked(): void {
  if (!_vaultUnlocked) throw new Error('vault_locked')
}

async function openKeypairDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEYPAIR_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(KEYPAIR_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function storeKeypair(serverId: string, keypair: CryptoKeyPair): Promise<void> {
  const db = await openKeypairDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYPAIR_STORE, 'readwrite')
    tx.objectStore(KEYPAIR_STORE).put({ publicKey: keypair.publicKey, privateKey: keypair.privateKey }, serverId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadKeypair(serverId: string): Promise<CryptoKeyPair | null> {
  const db = await openKeypairDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYPAIR_STORE, 'readonly')
    const req = tx.objectStore(KEYPAIR_STORE).get(serverId)
    req.onsuccess = () => resolve(req.result ? (req.result as CryptoKeyPair) : null)
    req.onerror = () => reject(req.error)
  })
}

export async function getOrCreateDeviceKeypair(serverId: string): Promise<CryptoKeyPair> {
  assertVaultUnlocked()
  const existing = await loadKeypair(serverId)
  if (existing) return existing

  const keypair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable private key
    ['sign', 'verify'],
  )
  await storeKeypair(serverId, keypair)
  return keypair
}

export async function exportPublicKeySpki(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', publicKey)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export interface SignPayload {
  op: string
  server_id: string
  challenge_id: string
  nonce: string
  device_public_key: string
  client_type: string
  expires_at: string
}

export async function signChallenge(privateKey: CryptoKey, payload: SignPayload): Promise<string> {
  assertVaultUnlocked()
  // Go's json.Marshal(map[string]string{}) sorts keys alphabetically — match that here
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  const data = new TextEncoder().encode(JSON.stringify(sorted))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function createFreshKeypair(): Promise<CryptoKeyPair> {
  assertVaultUnlocked()
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function storeKeypairForServer(serverId: string, keypair: CryptoKeyPair): Promise<void> {
  assertVaultUnlocked()
  await storeKeypair(serverId, keypair)
}
