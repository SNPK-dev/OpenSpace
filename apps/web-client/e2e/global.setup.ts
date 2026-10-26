import { test as setup } from '@playwright/test'
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { TEST_USERNAME, TEST_PASSWORD, AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

const BASE_URL = 'http://localhost:5174'

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

setup('global auth setup', async () => {
  if (!ADMIN_TOKEN) {
    throw new Error('ADMIN_API_TOKEN env var is required for Playwright setup')
  }

  // Create invite (ignore errors — may already exist from prior runs)
  const invRes = await fetch(`${API_URL}/api/v1/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 5 }),
  })

  if (invRes.ok) {
    const invite = await jsonOrThrow<{ code: string }>(invRes, 'create user invite')
    // Register test user (ignore 409 = already exists)
    await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_code: invite.code,
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        display_name: 'E2E Test User',
      }),
    })
  }

  const identitiesRes = await fetch(`${API_URL}/api/v1/admin/identities`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  })
  const identities = await jsonOrThrow<Array<{ id: string; username: string }>>(identitiesRes, 'list identities for user setup')
  const identity = identities.find(item => item.username === TEST_USERNAME)
  if (!identity) throw new Error(`Test user ${TEST_USERNAME} not found after setup`)
  const roleRes = await fetch(`${API_URL}/api/v1/admin/identities/${identity.id}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ role: 'member' }),
  })
  if (!roleRes.ok && roleRes.status !== 409) {
    throw new Error(`assign member role failed: ${roleRes.status} ${await roleRes.text()}`)
  }

  // Login via API to get a fresh token
  const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  })
  if (!loginRes.ok) {
    throw new Error(`Failed to login as ${TEST_USERNAME}: ${loginRes.status}`)
  }
  const { token } = await jsonOrThrow<{ token: string }>(loginRes, `login as ${TEST_USERNAME}`)

  // Inject token + vault bypass flag into localStorage, then save storageState.
  // The __e2e_skip_vault flag makes VaultContext (dev-only) skip the vault check
  // and mark the vault as 'unlocked', so all subsequent tests see the main layout.
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.addInitScript(({ tok }: { tok: string }) => {
    localStorage.setItem('openspace_token', tok)
    localStorage.setItem('__e2e_skip_vault', '1')
  }, { tok: token })

  await page.goto(`${BASE_URL}/`)

  // Wait for main layout (not onboarding/unlock redirect)
  await page.waitForSelector('.app-layout, .empty-pane', { timeout: 15_000 })

  fs.mkdirSync(AUTH_STATE_PATH.replace(/[^/\\]+$/, ''), { recursive: true })
  await context.storageState({ path: AUTH_STATE_PATH })
  await browser.close()
})
