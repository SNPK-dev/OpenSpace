import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH } from './shared'

test.describe('Desktop onboarding and local vault', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated access to root shows onboarding', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.onboarding-title')).toBeVisible()
    await expect(page.locator('a[href="#/onboarding/create-profile"]')).toBeVisible()
    await expect(page.locator('a[href="#/onboarding/pair-device"]')).toBeVisible()
  })

  test('brand logo renders without crop on onboarding', async ({ page }) => {
    await page.goto('/')
    const onboardingLogo = page.locator('.onboarding-logo img')
    await expect(onboardingLogo).toBeVisible()
    await expect(onboardingLogo).toHaveCSS('object-fit', 'contain')
  })

  test('create profile form renders required local-vault fields', async ({ page }) => {
    await page.goto('/#/onboarding/create-profile')
    await expect(page.locator('#profile-name')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#repeat')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test('create profile validates password mismatch', async ({ page }) => {
    await page.goto('/#/onboarding/create-profile')
    await page.locator('#profile-name').fill('Desktop E2E')
    await page.locator('#password').fill('long-password')
    await page.locator('#repeat').fill('different-password')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.alert-error')).toBeVisible()
  })

  test('pair-device form requires a transfer link before submit', async ({ page }) => {
    await page.goto('/#/onboarding/pair-device')
    await expect(page.locator('#transfer-link')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })

  test('legacy login and register routes are redirected to onboarding', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.locator('.onboarding-title')).toBeVisible()

    await page.goto('/#/register')
    await expect(page.locator('.onboarding-title')).toBeVisible()
  })
})

test.describe('Desktop authenticated session', () => {
  test.use({ storageState: AUTH_STATE_PATH })

  test('authenticated user sees selected server, sidebar and identity', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-layout')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.sidebar-header')).toHaveText('OpenSpace')
    await expect(page.locator('.sidebar-user')).toBeVisible()
  })

  test('online server status dot uses presence token color', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-layout')).toBeVisible({ timeout: 10_000 })
    const onlineDot = page.locator('.server-state-dot--online').first()
    await expect(onlineDot).toBeVisible()
    await expect(onlineDot).toHaveCSS('background-color', 'rgb(61, 190, 139)')
  })

  test('vault lock sends the user to unlock screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-layout')).toBeVisible({ timeout: 10_000 })
    await page.locator('.btn-icon[title="Lock vault"]').click()
    await expect(page.locator('#password')).toBeVisible({ timeout: 10_000 })
    const authLogo = page.locator('.auth-logo img')
    await expect(authLogo).toBeVisible()
    await expect(authLogo).toHaveCSS('object-fit', 'contain')
  })
})
