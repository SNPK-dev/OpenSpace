import { test, expect } from '@playwright/test'
import { ADMIN_TEST_USERNAME, ADMIN_TEST_PASSWORD, AUTH_STATE_PATH } from './shared'

test.describe('Admin Auth (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows OpenSpace Admin login heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('OpenSpace Admin')
    await expect(page.locator('#username')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
  })

  test('login with valid admin credentials succeeds', async ({ page }) => {
    await page.goto('/')
    await page.locator('#username').fill(ADMIN_TEST_USERNAME)
    await page.locator('#password').fill(ADMIN_TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    // After login, admin panel content should be visible
    await expect(page.locator('.layout')).toBeVisible({ timeout: 30_000 })
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/')
    await page.locator('#username').fill('notanadmin')
    await page.locator('#password').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('.alert-error')).toBeVisible()
  })
})

test.describe('Admin Auth (authenticated)', () => {
  test.use({ storageState: AUTH_STATE_PATH })

  test('admin panel is accessible when authenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.layout')).toBeVisible({ timeout: 5000 })
  })
})
