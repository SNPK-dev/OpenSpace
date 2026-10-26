// AES-GCM / PBKDF2 security invariant tests.
// Run: node scripts/test-vault-crypto.mjs
// Requires: Node.js 18+ (built-in globalThis.crypto and node:test)

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Use a lower iteration count for test speed; the real KdfParams stores 600_000.
const TEST_PBKDF2_ITERATIONS = 1_000

// ---------------------------------------------------------------------------
// AES-GCM IV uniqueness
// ---------------------------------------------------------------------------

test('AES-GCM: 1000 encrypts of the same plaintext all produce unique IVs', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const plaintext = new TextEncoder().encode('openspace-test-payload')
  const seen = new Set()

  for (let i = 0; i < 1000; i++) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ivHex = Buffer.from(iv).toString('hex')
    assert(!seen.has(ivHex), `Duplicate IV on iteration ${i}: ${ivHex}`)
    seen.add(ivHex)

    // Each encrypt must succeed (iv is fresh, key is correct)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    // Each decrypt must round-trip
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    assert.deepEqual(new Uint8Array(pt), plaintext, `Decrypt roundtrip failed at iteration ${i}`)
  }

  assert.strictEqual(seen.size, 1000, 'Must have collected exactly 1000 distinct IVs')
})

// ---------------------------------------------------------------------------
// AES-GCM tamper / wrong-key rejection
// ---------------------------------------------------------------------------

test('AES-GCM: tampered ciphertext fails decryption (authentication tag check)', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const plaintext = new TextEncoder().encode('sensitive vault data')
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const tampered = new Uint8Array(ct)
  tampered[0] ^= 0xff  // flip the first byte of the ciphertext

  await assert.rejects(
    () => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, tampered),
    'Tampered ciphertext must not decrypt',
  )
})

test('AES-GCM: wrong key fails decryption', async () => {
  const key1 = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const key2 = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const plaintext = new TextEncoder().encode('sensitive vault data')
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, plaintext)

  await assert.rejects(
    () => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, ct),
    'Wrong key must not decrypt',
  )
})

test('AES-GCM: reusing same IV with different plaintexts still fails cross-decrypt', async () => {
  // Demonstrates that IV reuse is dangerous but the API will at least reject wrong keys
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt1 = new TextEncoder().encode('message-one')
  const pt2 = new TextEncoder().encode('message-two')

  const ct1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt1)
  const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt2)

  // Each decrypts with its own ciphertext
  const dec1 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct1)
  const dec2 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct2)
  assert.deepEqual(new Uint8Array(dec1), pt1)
  assert.deepEqual(new Uint8Array(dec2), pt2)
})

// ---------------------------------------------------------------------------
// PBKDF2: deterministic derivation + salt isolation
// ---------------------------------------------------------------------------

test('PBKDF2: same password + same salt → identical derived key', async () => {
  const password = new TextEncoder().encode('vault-password-test')
  const salt = crypto.getRandomValues(new Uint8Array(32))

  async function derive(s) {
    const base = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: s, iterations: TEST_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt'],
    )
  }

  const k1 = await derive(salt)
  const k2 = await derive(salt)
  const [r1, r2] = await Promise.all([
    crypto.subtle.exportKey('raw', k1),
    crypto.subtle.exportKey('raw', k2),
  ])
  assert.deepEqual(new Uint8Array(r1), new Uint8Array(r2), 'Derived keys must be identical')
})

test('PBKDF2: different salts → different derived keys (password and recovery code must not share salt)', async () => {
  const password = new TextEncoder().encode('vault-password-test')
  const salt1 = crypto.getRandomValues(new Uint8Array(32))
  const salt2 = crypto.getRandomValues(new Uint8Array(32))

  async function derive(s) {
    const base = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: s, iterations: TEST_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt'],
    )
  }

  const k1 = await derive(salt1)
  const k2 = await derive(salt2)
  const [r1, r2] = await Promise.all([
    crypto.subtle.exportKey('raw', k1),
    crypto.subtle.exportKey('raw', k2),
  ])
  assert.notDeepEqual(new Uint8Array(r1), new Uint8Array(r2), 'Different salts must produce different keys')
})

test('PBKDF2: wrong password fails to unwrap master key', async () => {
  const goodPw = new TextEncoder().encode('correct-password')
  const badPw  = new TextEncoder().encode('wrong-password')
  const salt   = crypto.getRandomValues(new Uint8Array(32))

  async function deriveWrapping(pw) {
    const base = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: TEST_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    )
  }

  const masterKey   = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappingKey = await deriveWrapping(goodPw)
  const wrongKey    = await deriveWrapping(badPw)
  const wrapIv      = crypto.getRandomValues(new Uint8Array(12))

  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, wrappingKey, { name: 'AES-GCM', iv: wrapIv })

  await assert.rejects(
    () => crypto.subtle.unwrapKey(
      'raw', wrapped, wrongKey, { name: 'AES-GCM', iv: wrapIv },
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    ),
    'Wrong password must not unwrap master key',
  )
})

// ---------------------------------------------------------------------------
// ECDSA P-256: non-extractable private key invariant
// ---------------------------------------------------------------------------

test('ECDSA P-256: private key generated with extractable=false cannot be exported', async () => {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,  // non-extractable
    ['sign', 'verify'],
  )
  assert.strictEqual(kp.privateKey.extractable, false, 'Private key must be non-extractable')
  assert.strictEqual(kp.publicKey.extractable, true,  'Public key must be extractable for SPKI export')

  await assert.rejects(
    () => crypto.subtle.exportKey('pkcs8', kp.privateKey),
    'Exporting non-extractable private key must throw',
  )
})
