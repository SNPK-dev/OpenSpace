import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

test.describe('Rooms and Channels', () => {
  let roomId: string
  let roomName: string
  let channelId: string
  let channelName: string

  test.beforeAll(async () => {
    const suffix = Date.now()
    roomName = `PW Test Room ${suffix}`
    channelName = `general-${suffix}`

    // Create test room + channel via API
    const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: roomName, default_room_type: 'text', default_room_name: channelName }),
    })
    const room = await jsonOrThrow<{ id: string }>(roomRes, 'create room group')
    roomId = room.id

    const chRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    const { channels } = await jsonOrThrow<{ channels: Array<{ id: string; name: string }> }>(chRes, 'list default room')
    const ch = channels.find(c => c.name === channelName) ?? channels[0]
    if (!ch) throw new Error('created room group has no default room')
    channelId = ch.id
  })

  test.afterAll(async () => {
    await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
  })

  test('sidebar is visible after login', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.sidebar-header')).toHaveText('OpenSpace')
  })

  test('created room appears in sidebar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sidebar-body')).toContainText(roomName)
  })

  test('expanding room shows its channel', async ({ page }) => {
    await page.goto('/')
    // Click the room to expand
    await page.locator('.channel-group-toggle', { hasText: roomName }).click()
    // Channel should now be visible
    await expect(page.locator('.channel-item', { hasText: channelName })).toBeVisible()
  })

  test('clicking a text channel opens chat pane', async ({ page }) => {
    await page.goto('/')
    // Expand room
    await page.locator('.channel-group-toggle', { hasText: roomName }).click()
    // Click channel
    await page.locator('.channel-item', { hasText: channelName }).click()
    // Verify chat pane appears
    await expect(page.locator('.chat-pane')).toBeVisible()
    await expect(page.locator('.chat-input')).toBeVisible()
  })

  test('can navigate directly to a channel by URL', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await expect(page.locator('.chat-pane')).toBeVisible()
    await expect(page.locator('.chat-input')).toBeVisible()
  })

  test('channel header shows channel name', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await expect(page.locator('.channel-header')).toContainText(channelName)
  })

  test('user identity is shown in sidebar after refresh', async ({ page }) => {
    await page.goto('/')
    // After identity restore via /api/v1/me, sidebar shows username
    await page.waitForTimeout(1000)
    await expect(page.locator('.sidebar-user .user-name')).not.toBeEmpty()
  })
})
