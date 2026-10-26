import { test as setup, chromium } from '@playwright/test'
import fs from 'node:fs'
import { TEST_USERNAME, TEST_PASSWORD, AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

const BASE_URL = 'http://localhost:5176'

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

setup('global desktop auth setup', async () => {
  if (!ADMIN_TOKEN) {
    throw new Error('ADMIN_API_TOKEN env var is required for Playwright desktop setup')
  }

  // Create invite (idempotent — ignore 409 if user already exists)
  const invRes = await fetch(`${API_URL}/api/v1/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 5 }),
  })

  if (invRes.ok) {
    const invite = await jsonOrThrow<{ code: string }>(invRes, 'create desktop user invite')
    await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_code: invite.code,
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        display_name: 'Desktop E2E User',
      }),
    })
  }

  const identitiesRes = await fetch(`${API_URL}/api/v1/admin/identities`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  })
  const identities = await jsonOrThrow<Array<{ id: string; username: string }>>(identitiesRes, 'list identities for desktop setup')
  const identity = identities.find(item => item.username === TEST_USERNAME)
  if (!identity) throw new Error(`Test user ${TEST_USERNAME} not found after desktop setup`)
  const roleRes = await fetch(`${API_URL}/api/v1/admin/identities/${identity.id}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ role: 'member' }),
  })
  if (!roleRes.ok && roleRes.status !== 409) {
    throw new Error(`assign desktop member role failed: ${roleRes.status} ${await roleRes.text()}`)
  }

  // Login via API to get a fresh token
  const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  })
  if (!loginRes.ok) {
    throw new Error(`Failed to login as ${TEST_USERNAME}: ${loginRes.status} ${await loginRes.text()}`)
  }
  const { token } = await jsonOrThrow<{ token: string }>(loginRes, `login as ${TEST_USERNAME}`)

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  // Inject token + vault bypass before any navigation so VaultContext initializes
  // synchronously as 'unlocked' — avoids the 'no_vault' → /onboarding redirect.
  await page.addInitScript(({ tok }: { tok: string }) => {
    localStorage.setItem('openspace_token', tok)
    localStorage.setItem('__e2e_skip_vault', '1')
  }, { tok: token })

  await page.goto(`${BASE_URL}/`)
  await page.waitForSelector('.app-layout', { timeout: 15_000 })

  fs.mkdirSync(AUTH_STATE_PATH.replace(/[^/\\]+$/, ''), { recursive: true })
  await context.storageState({ path: AUTH_STATE_PATH })
  await browser.close()
})
