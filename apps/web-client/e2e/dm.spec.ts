import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, TEST_USERNAME, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

test.describe('Direct Messages', () => {
  let convId: string

  test.beforeAll(async () => {
    // Find the test user's identity ID
    const identitiesRes = await fetch(`${API_URL}/api/v1/admin/identities`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    const identities = await jsonOrThrow<Array<{ id: string; username: string }>>(identitiesRes, 'list identities for DM setup')
    const testUser = identities.find(i => i.username === TEST_USERNAME)
    if (!testUser) throw new Error(`Test user ${TEST_USERNAME} not found`)

    // Create DM from admin → test user so test user sees it in their sidebar
    const dmRes = await fetch(`${API_URL}/api/v1/dm/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ recipient_id: testUser.id }),
    })
    const dm = await jsonOrThrow<{ id: string }>(dmRes, 'create DM conversation')
    convId = dm.id
  })

  test('DM conversation appears in sidebar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sidebar-section-label', { hasText: 'Direct Messages' })).toBeVisible({ timeout: 15_000 })
  })

  test('can navigate to DM conversation', async ({ page }) => {
    await page.goto(`/dm/${convId}`)
    await expect(page.locator('.chat-pane, .dm-pane')).toBeVisible({ timeout: 5000 })
  })

  test('can send a DM message', async ({ page }) => {
    await page.goto(`/dm/${convId}`)
    const msg = `PW DM message ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 5000 })
  })
})
