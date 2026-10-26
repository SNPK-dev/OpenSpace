import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decryptWithMaster, encryptWithMaster } from '../src/crypto/vault.ts'

test('vault encryption round-trips payloads larger than the V8 argument limit', async () => {
  const masterKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const vaultData = {
    profile: { name: 'Large vault' },
    servers: [{ server_id: 'server-1', access_token: 'a'.repeat(256 * 1024) }],
  }

  const encrypted = await encryptWithMaster(masterKey, vaultData)
  const decrypted = await decryptWithMaster(masterKey, encrypted.ciphertext, encrypted.iv)

  assert.deepEqual(decrypted, vaultData)
})
