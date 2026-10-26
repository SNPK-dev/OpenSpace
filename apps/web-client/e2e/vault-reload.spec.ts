import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const PASSWORD = 'VaultReload123!'
const SERVER_URL = 'https://vault-reload.test'
const SERVER_ID = '11111111-2222-4333-8444-555555555555'
const CLEAN_ORIGIN = 'http://127.0.0.1:5174'

test('added server survives reload and unlock through encrypted IndexedDB vault', async ({ page }) => {
  await page.route(`${SERVER_URL}/.well-known/openspace/server`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      server_id: SERVER_ID,
      name: 'Persistent Test Server',
      description: 'Vault reload regression',
      public_url: SERVER_URL,
      avatar_url: '',
      registration_policy: 'open',
      features: { text: true, voice: true, files: true, device_pairing: true },
      tls_required: true,
    }),
  }))
  await page.route(`${SERVER_URL}/api/auth/device-registration/challenge`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      challenge_id: 'challenge-1',
      server_id: SERVER_ID,
      nonce: 'nonce-1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
  }))
  await page.route(`${SERVER_URL}/api/auth/device-registration/complete`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      server_identity_id: 'identity-1',
      device_id: 'device-1',
      identity_status: 'active',
      // Regression: production credentials and server metadata can make the
      // encrypted vault exceed V8's maximum spread-argument count.
      access_token: 'a'.repeat(256 * 1024),
    }),
  }))

  await page.goto(`${CLEAN_ORIGIN}/onboarding/create-profile`)
  await page.locator('#profile-name').fill('Vault reload test')
  await page.locator('#password').fill(PASSWORD)
  await page.locator('#repeat').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('.app-layout')).toBeVisible()

  await page.locator('.server-rail-add').click()
  await page.locator('#server-url').fill(SERVER_URL)
  await page.locator('.modal form .btn-primary').click()
  await expect(page.locator('.server-info-card')).toBeVisible()
  await page.locator('.modal-body > div > .modal-actions .btn-primary').click()

  await expect(page.locator('.server-rail-item[title="Persistent Test Server"]')).toBeVisible()

  const encryptedBeforeReload = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('openspace_vault', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('vault', 'readonly').objectStore('vault').get('openspace_vault_crypto')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }) as { encryptedVault?: string }
  expect(encryptedBeforeReload.encryptedVault).toBeTruthy()

  await page.reload()
  await expect(page).toHaveURL(/\/unlock$/)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()

  await expect(page.locator('.server-rail-item[title="Persistent Test Server"]')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Persistent Test Server server actions' }).click()
  const leaveMenuItem = page.getByRole('menuitem', { name: 'Leave server' })
  await expect(leaveMenuItem).toBeVisible()
  await leaveMenuItem.click()
  await expect(page.getByRole('heading', { name: 'Leave server?' })).toBeVisible()
})
