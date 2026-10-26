import { test as setup } from '@playwright/test'
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { ADMIN_TEST_USERNAME, ADMIN_TEST_PASSWORD, AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

const BASE_URL = 'http://localhost:5175'

setup('global admin auth setup', async () => {
  if (!ADMIN_TOKEN) {
    throw new Error('ADMIN_API_TOKEN env var is required for Playwright admin setup')
  }

  // Create a test admin user with admin role
  const invRes = await fetch(`${API_URL}/api/v1/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 1 }),
  })

  if (invRes.ok) {
    const invite = await invRes.json() as { code: string }
    const regRes = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_code: invite.code,
        username: ADMIN_TEST_USERNAME,
        password: ADMIN_TEST_PASSWORD,
        display_name: 'Admin E2E User',
      }),
    })
    if (regRes.ok) {
      const regData = await regRes.json() as { identity?: { id?: string } }
      const identityId = regData.identity?.id
      if (identityId) {
        await fetch(`${API_URL}/api/v1/admin/identities/${identityId}/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
          body: JSON.stringify({ role: 'admin' }),
        })
      }
    }
  }

  // Log in via browser
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${BASE_URL}/`)
  await page.locator('#username').fill(ADMIN_TEST_USERNAME)
  await page.locator('#password').fill(ADMIN_TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(3000)

  fs.mkdirSync(AUTH_STATE_PATH.replace(/[^/\\]+$/, ''), { recursive: true })
  await context.storageState({ path: AUTH_STATE_PATH })
  await browser.close()
})
