import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

const fakeServer = 'http://localhost:9444'
const metadata = {
  server_id: '11111111-2222-4333-8444-555555555555',
  name: 'Invite Recovery Fixture',
  description: '',
  public_url: fakeServer,
  avatar_url: '',
  registration_policy: 'invite_code_only',
  features: { text: true, voice: true, files: true, device_pairing: true },
  tls_required: false,
}

for (const scenario of [
  { code: 'invite_expired', message: 'This invite has expired. Ask an administrator for a new invite.' },
  { code: 'invite_revoked', message: 'This invite is invalid or has been revoked. Ask an administrator for a new invite.' },
]) {
  test(`${scenario.code} keeps the invite step recoverable with a clear action`, async ({ page }) => {
    await page.route(`${fakeServer}/.well-known/openspace/server`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metadata) }))
    await page.route(`${fakeServer}/api/auth/device-registration/challenge`, route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: scenario.code }) }))
    await page.goto('/')
    await page.getByTitle('Add server').click()
    await page.getByLabel('Server address').fill(fakeServer)
    await page.getByRole('button', { name: 'Find server' }).click()
    await expect(page.getByText('Registration: invite code only')).toBeVisible()
    await page.getByRole('button', { name: 'Connect' }).click()
    await page.getByLabel('Invite code').fill('INVALID-INVITE')
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByRole('alert')).toHaveText(scenario.message)
    await expect(page.getByLabel('Invite code')).toHaveValue('INVALID-INVITE')
    await expect(page.getByRole('button', { name: 'Connect' })).toBeEnabled()
  })
}

test('closed registration explains the next valid action without attempting registration', async ({ page }) => {
  await page.route(`${fakeServer}/.well-known/openspace/server`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ...metadata, registration_policy: 'closed' }),
  }))
  await page.goto('/')
  await page.getByTitle('Add server').click()
  await page.getByLabel('Server address').fill(fakeServer)
  await page.getByRole('button', { name: 'Find server' }).click()
  await expect(page.getByRole('alert')).toHaveText('Registration is closed on this server.')
  await expect(page.getByRole('button', { name: 'Find server' })).toBeEnabled()
})
