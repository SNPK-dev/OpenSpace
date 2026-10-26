import { test, expect } from '@playwright/test'

// These tests intentionally run without stored auth/vault state.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Onboarding and local vault', () => {
  test('unauthenticated access to / redirects to onboarding', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/onboarding')
    await expect(page.locator('.onboarding-logo img[alt="OpenSpace"]')).toBeVisible()
    await expect(page.locator('.onboarding-title')).toBeVisible()
  })

  test('onboarding exposes create-profile and pair-device actions', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.locator('a[href="/onboarding/create-profile"]')).toBeVisible()
    await expect(page.locator('a[href="/onboarding/pair-device"]')).toBeVisible()
  })

  test('create profile form renders required local-vault fields', async ({ page }) => {
    await page.goto('/onboarding/create-profile')
    await expect(page.locator('#profile-name')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#repeat')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('create profile validates password mismatch', async ({ page }) => {
    await page.goto('/onboarding/create-profile')
    await page.locator('#profile-name').fill('PW Local Profile')
    await page.locator('#password').fill('PwLocal123!')
    await page.locator('#repeat').fill('Different123!')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.alert-error')).toBeVisible()
  })

  test('pair-device form requires a transfer link before submit', async ({ page }) => {
    await page.goto('/onboarding/pair-device')
    await expect(page.locator('#transfer-link')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })

  test('legacy login and register routes are redirected to onboarding', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL('/onboarding')

    await page.goto('/register')
    await expect(page).toHaveURL('/onboarding')
  })

  test('admin token key does not authenticate web-client', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openspace_token', 'admin-token-from-admin-web')
    })

    await page.goto('/')

    await expect(page).toHaveURL('/onboarding')
    await expect(page.locator('.onboarding-title')).toBeVisible()
    await expect(page.evaluate(() => localStorage.getItem('openspace_web_token'))).resolves.toBeNull()
  })

  test('stale web token 401 clears token without redirecting to pair-device', async ({ page }) => {
    await page.route('**/api/v1/me', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthorized' }),
    }))
    await page.addInitScript(() => {
      localStorage.setItem('openspace_web_token', 'stale-web-token')
    })

    await page.goto('/onboarding')

    await expect(page).toHaveURL('/onboarding')
    await expect(page.locator('.onboarding-title')).toBeVisible()
    await expect(page.evaluate(() => localStorage.getItem('openspace_web_token'))).resolves.toBeNull()
  })
})
