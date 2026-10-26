// Local Vault cryptography using WebCrypto.
// Master key is wrapped by a password-derived key (PBKDF2 + AES-GCM).
// A second wrapping uses the recovery-code-derived key.

const PBKDF2_ITERATIONS = 600_000

export interface WrappedKey {
  ciphertext: string   // base64
  iv: string           // base64
  salt: string         // base64
}

export interface KdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
}

export interface VaultCrypto {
  encryptedVault: string       // base64 AES-GCM ciphertext
  vaultIv: string              // base64
  passwordKey: WrappedKey      // master key wrapped by password
  recoveryKey: WrappedKey      // master key wrapped by recovery code
  kdfParams: KdfParams         // saved for future migration path
}

// Derives a 256-bit key from a passphrase using PBKDF2.
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(passphrase)
  const baseKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function wrapMasterKey(masterKey: CryptoKey, wrappingKey: CryptoKey): Promise<WrappedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.wrapKey('raw', masterKey, wrappingKey, { name: 'AES-GCM', iv: toArrayBuffer(iv) })
  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    salt: '', // filled by caller
  }
}

async function unwrapMasterKey(wrapped: WrappedKey, wrappingKey: CryptoKey, extractable = false): Promise<CryptoKey> {
  const iv = fromBase64(wrapped.iv)
  const ciphertext = fromBase64(wrapped.ciphertext)
  return crypto.subtle.unwrapKey(
    'raw',
    toArrayBuffer(ciphertext),
    wrappingKey,
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

// Encrypts arbitrary JSON data with master key.
export async function encryptWithMaster(masterKey: CryptoKey, data: unknown): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, masterKey, toArrayBuffer(plaintext))
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) }
}

export async function decryptWithMaster(masterKey: CryptoKey, ciphertext: string, iv: string): Promise<unknown> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(iv)) },
    masterKey,
    toArrayBuffer(fromBase64(ciphertext)),
  )
  return JSON.parse(new TextDecoder().decode(plain))
}

export interface CreateVaultResult {
  vaultCrypto: VaultCrypto
  masterKey: CryptoKey
  recoveryCode: string
}

export async function createVault(password: string, vaultData: unknown): Promise<CreateVaultResult> {
  const masterKey = await generateMasterKey()

  const passwordSalt = crypto.getRandomValues(new Uint8Array(32))
  const passwordDerivedKey = await deriveKey(password, passwordSalt)

  const recoveryCode = generateRecoveryCode()
  const recoverySalt = crypto.getRandomValues(new Uint8Array(32))
  const recoveryDerivedKey = await deriveKey(recoveryCode, recoverySalt)

  const passwordWrapped = await wrapMasterKey(masterKey, passwordDerivedKey)
  passwordWrapped.salt = toBase64(passwordSalt)

  const recoveryWrapped = await wrapMasterKey(masterKey, recoveryDerivedKey)
  recoveryWrapped.salt = toBase64(recoverySalt)

  const { ciphertext, iv } = await encryptWithMaster(masterKey, vaultData)

  return {
    vaultCrypto: {
      encryptedVault: ciphertext,
      vaultIv: iv,
      passwordKey: passwordWrapped,
      recoveryKey: recoveryWrapped,
      kdfParams: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    },
    masterKey,
    recoveryCode,
  }
}

export async function unlockVault(vaultCrypto: VaultCrypto, password: string): Promise<{ masterKey: CryptoKey; vaultData: unknown }> {
  const salt = fromBase64(vaultCrypto.passwordKey.salt)
  const passwordDerivedKey = await deriveKey(password, salt)
  const masterKey = await unwrapMasterKey(vaultCrypto.passwordKey, passwordDerivedKey)
  const vaultData = await decryptWithMaster(masterKey, vaultCrypto.encryptedVault, vaultCrypto.vaultIv)
  return { masterKey, vaultData }
}

export async function recoverVault(vaultCrypto: VaultCrypto, recoveryCode: string): Promise<{ masterKey: CryptoKey; vaultData: unknown }> {
  const salt = fromBase64(vaultCrypto.recoveryKey.salt)
  const recoveryDerivedKey = await deriveKey(recoveryCode, salt)
  const masterKey = await unwrapMasterKey(vaultCrypto.recoveryKey, recoveryDerivedKey)
  const vaultData = await decryptWithMaster(masterKey, vaultCrypto.encryptedVault, vaultCrypto.vaultIv)
  return { masterKey, vaultData }
}

export async function reEncryptVault(masterKey: CryptoKey, vaultData: unknown, newPassword: string): Promise<{ vaultCrypto: VaultCrypto; recoveryCode: string }> {
  const passwordSalt = crypto.getRandomValues(new Uint8Array(32))
  const passwordDerivedKey = await deriveKey(newPassword, passwordSalt)

  const recoverySalt = crypto.getRandomValues(new Uint8Array(32))
  // Re-derive with existing recovery code is not possible without it; re-wrap with a new recovery code
  // For same-device recovery, we re-generate recovery code
  const recoveryCode = generateRecoveryCode()
  const recoveryDerivedKey = await deriveKey(recoveryCode, recoverySalt)

  const passwordWrapped = await wrapMasterKey(masterKey, passwordDerivedKey)
  passwordWrapped.salt = toBase64(passwordSalt)

  const recoveryWrapped = await wrapMasterKey(masterKey, recoveryDerivedKey)
  recoveryWrapped.salt = toBase64(recoverySalt)

  const { ciphertext, iv } = await encryptWithMaster(masterKey, vaultData)

  return { vaultCrypto: {
    encryptedVault: ciphertext,
    vaultIv: iv,
    passwordKey: passwordWrapped,
    recoveryKey: recoveryWrapped,
    kdfParams: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
  }, recoveryCode }
}

export async function resetPasswordWithRecovery(vaultCrypto: VaultCrypto, recoveryCode: string, newPassword: string): Promise<{ vaultCrypto: VaultCrypto; masterKey: CryptoKey; vaultData: unknown }> {
  const recoverySalt = fromBase64(vaultCrypto.recoveryKey.salt)
  const recoveryDerivedKey = await deriveKey(recoveryCode, recoverySalt)
  const exportableMasterKey = await unwrapMasterKey(vaultCrypto.recoveryKey, recoveryDerivedKey, true)
  const vaultData = await decryptWithMaster(exportableMasterKey, vaultCrypto.encryptedVault, vaultCrypto.vaultIv)
  const passwordSalt = crypto.getRandomValues(new Uint8Array(32))
  const passwordDerivedKey = await deriveKey(newPassword, passwordSalt)
  const passwordKey = await wrapMasterKey(exportableMasterKey, passwordDerivedKey)
  passwordKey.salt = toBase64(passwordSalt)
  const rawMasterKey = new Uint8Array(await crypto.subtle.exportKey('raw', exportableMasterKey))
  const masterKey = await crypto.subtle.importKey('raw', rawMasterKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  rawMasterKey.fill(0)
  return { vaultCrypto: { ...vaultCrypto, passwordKey }, masterKey, vaultData }
}

// Simple 12-word recovery code using crypto-random 4-digit groups
function generateRecoveryCode(): string {
  const words: string[] = []
  for (let i = 0; i < 12; i++) {
    const n = new Uint16Array(1)
    crypto.getRandomValues(n)
    words.push((n[0] ?? 0).toString(16).padStart(4, '0'))
  }
  return words.join('-')
}

function toBase64(buf: Uint8Array): string {
  // Passing the whole ciphertext through the spread operator turns every byte
  // into a function argument. V8 rejects large vault snapshots with
  // "Maximum call stack size exceeded", so build the binary string in chunks.
  let binary = ''
  const chunkSize = 8192
  for (let offset = 0; offset < buf.length; offset += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
