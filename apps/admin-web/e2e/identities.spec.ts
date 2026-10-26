import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

test.describe('Identities Management', () => {
  test('identities page shows table with users', async ({ page }) => {
    await page.goto('/admin/identities')
    await expect(page.locator('h2')).toHaveText('Identities')
    await expect(page.locator('table.table')).toBeVisible()
    await expect(page.locator('table.table thead tr th').first()).toHaveText('Username')
  })

  test('identities table has at least one row', async ({ page }) => {
    await page.goto('/admin/identities')
    const rows = page.locator('table.table tbody tr')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('each identity row shows username and status badge', async ({ page }) => {
    await page.goto('/admin/identities')
    const firstRow = page.locator('table.table tbody tr').first()
    await expect(firstRow.locator('td code')).toBeVisible()
    await expect(firstRow.locator('.badge')).toBeVisible()
  })
})

test.describe('Invites Management', () => {
  test('invites page is accessible', async ({ page }) => {
    await page.goto('/admin/invites')
    await expect(page.locator('.page-header h2')).toBeVisible()
    await expect(page.locator('form')).toBeVisible()
  })

  test('can generate a new invite code', async ({ page }) => {
    await page.goto('/admin/invites')
    // Fill max uses
    await page.locator('#max_uses').fill('1')
    // Click generate/create button
    const generateBtn = page.locator('button[type="submit"]')
    await expect(generateBtn).toBeVisible()
    await generateBtn.click()
    // An invite code should appear
    await expect(page.locator('.invite-code-badge')).toBeVisible({ timeout: 5000 })
  })
})
