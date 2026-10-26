import { test, expect } from '@playwright/test'
import { open } from 'node:fs/promises'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

test.describe('Messages', () => {
  let roomId: string
  let channelId: string

  test.beforeAll(async () => {
    const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: 'PW Msg Room' }),
    })
    const room = await roomRes.json() as { id: string }
    roomId = room.id

    const chRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: 'chat', type: 'text' }),
    })
    const ch = await chRes.json() as { id: string }
    channelId = ch.id
  })

  test.afterAll(async () => {
    await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
  })

  test('can type and send a message with Enter key', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    const msg = `PW test message ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    // Message should appear in the messages list
    await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 5000 })
  })

  test('sent message shows correct content', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    const msg = `Content check ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 5000 })
  })

  test('sent message shows sender display name', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    const msg = `Sender check ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    const msgGroup = page.locator('.message-group', { has: page.locator('.msg-content', { hasText: msg }) })
    await expect(msgGroup).toBeVisible({ timeout: 5000 })
    await expect(msgGroup.locator('.msg-author')).not.toBeEmpty()
  })

  test('can delete own message', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    const msg = `Delete me ${Date.now()}`

    // Send message
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    const msgGroup = page.locator('.message-group', { has: page.locator('.msg-content', { hasText: msg }) })
    await expect(msgGroup).toBeVisible({ timeout: 5000 })

    // Delete button should appear on own messages
    await expect(msgGroup.locator('.msg-delete')).toBeVisible()
    await msgGroup.locator('.msg-delete').click()

    // Message should disappear
    await expect(page.locator('.msg-content', { hasText: msg })).not.toBeVisible({ timeout: 5000 })
  })

  test('input clears after sending', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.locator('.chat-input').fill('Test input clear')
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.chat-input')).toHaveValue('')
  })

  test('Shift+Enter adds newline without sending', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.locator('.chat-input').fill('line1')
    await page.locator('.chat-input').press('Shift+Enter')
    await page.locator('.chat-input').type('line2')
    // Input should still have content (not sent)
    await expect(page.locator('.chat-input')).not.toHaveValue('')
  })

  test('uploads, sends, and exposes a downloadable attachment', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.locator('.attachment-picker input').setInputFiles({
      name: 'ui-upload.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('OpenSpace browser upload'),
    })
    await expect(page.locator('.upload-state')).toContainText('ui-upload.txt')
    await page.locator('.chat-input').fill('Attachment from the Web client')
    await page.locator('.chat-input').press('Enter')
    const attachment = page.locator('.message-attachment', { hasText: 'ui-upload.txt' }).first()
    await expect(attachment).toBeVisible({ timeout: 10_000 })
    const response = await page.request.get(await attachment.getAttribute('href') ?? '')
    expect(response.ok()).toBeTruthy()
    expect(await response.text()).toBe('OpenSpace browser upload')
  })

  test('cancelled upload retains a deterministic retry state', async ({ page }) => {
    await page.route('http://localhost:9000/**', async route => {
      if (route.request().method() === 'PUT') await new Promise(resolve => setTimeout(resolve, 5_000))
      await route.continue().catch(() => undefined)
    })
    await page.goto(`/channels/${channelId}`)
    await page.locator('.attachment-picker input').setInputFiles({ name: 'cancel.txt', mimeType: 'text/plain', buffer: Buffer.alloc(128_000, 1) })
    await page.locator('.chat-input').fill('Cancelled attachment')
    await page.locator('.chat-input').press('Enter')
    await expect(page.getByRole('button', { name: 'Cancel upload' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel upload' }).click()
    await expect(page.getByRole('alert')).toContainText('Upload cancelled')
    await expect(page.locator('.upload-state')).toContainText('cancel.txt')
  })

  test('offline send preserves the draft and succeeds on retry', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    const draft = `Offline retry ${Date.now()}`
    await page.route('**/api/v1/rooms/*/channels/*/messages', route => route.abort('internetdisconnected'))
    await page.locator('.chat-input').fill(draft)
    await page.locator('.chat-input').press('Enter')
    await expect(page.getByRole('alert')).toContainText('Retry when the connection is available')
    await expect(page.locator('.chat-input')).toHaveValue(draft)

    await page.unroute('**/api/v1/rooms/*/channels/*/messages')
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.msg-content', { hasText: draft })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.chat-input')).toHaveValue('')
  })

  test('oversized attachment is rejected before network upload', async ({ page }, testInfo) => {
    await page.goto(`/channels/${channelId}`)
    await expect(page.locator('.attachment-picker input')).toBeAttached()
    const path = testInfo.outputPath('over-limit.bin')
    const fixture = await open(path, 'w')
    await fixture.truncate(50 * 1024 * 1024 + 1)
    await fixture.close()
    await page.locator('.attachment-picker input').setInputFiles(path)
    await expect(page.getByRole('alert')).toContainText('File exceeds the 50 MB upload limit')
    await expect(page.locator('.upload-state')).toHaveCount(0)
  })
})
