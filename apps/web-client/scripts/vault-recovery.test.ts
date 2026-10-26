import test from 'node:test'
import assert from 'node:assert/strict'
import { createVault, recoverVault, resetPasswordWithRecovery, unlockVault } from '../src/crypto/vault.ts'

test('recovery code resets password without invalidating the saved recovery code', async () => {
  const data = { profile: { name: 'Recovery Test' }, servers: [{ server_id: 'server-1' }] }
  const created = await createVault('old-password', data)
  const reset = await resetPasswordWithRecovery(created.vaultCrypto, created.recoveryCode, 'new-password')

  await assert.rejects(() => unlockVault(reset.vaultCrypto, 'old-password'))
  assert.deepEqual((await unlockVault(reset.vaultCrypto, 'new-password')).vaultData, data)
  assert.deepEqual((await recoverVault(reset.vaultCrypto, created.recoveryCode)).vaultData, data)
  await assert.rejects(() => resetPasswordWithRecovery(reset.vaultCrypto, 'wrong-code', 'another-password'))
})
