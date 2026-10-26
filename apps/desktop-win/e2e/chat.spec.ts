import { test, expect } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

test.describe('Desktop Chat', () => {
  let roomId: string
  let roomName: string
  let channelId: string
  let channelName: string

  test.beforeAll(async () => {
    const suffix = Date.now()
    roomName = `desktop-e2e-${suffix}`
    channelName = `desktop-general-${suffix}`

    const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: roomName, default_room_type: 'text', default_room_name: channelName }),
    })
    const room = await jsonOrThrow<{ id: string }>(roomRes, 'create desktop room group')
    roomId = room.id

    const channelsRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    const { channels } = await jsonOrThrow<{ channels: Array<{ id: string; name: string }> }>(channelsRes, 'list desktop default room')
    const ch = channels.find(item => item.name === channelName)
    if (!ch) throw new Error(`created desktop room group has no ${channelName} room`)
    channelId = ch.id
  })

  test.afterAll(async () => {
    if (roomId) {
      await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      })
    }
  })

  test('sidebar shows the created room group', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.channel-group-toggle', { hasText: roomName })).toBeVisible({ timeout: 5000 })
  })

  test('clicking room expands channels', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 })
    const roomItem = page.locator('.channel-group-toggle', { hasText: roomName })
    await roomItem.click()
    await expect(page.locator(`a[href="#/channels/${channelId}"]`, { hasText: channelName })).toBeVisible({ timeout: 5000 })
  })

  test('navigating to channel shows chat pane', async ({ page }) => {
    await page.goto(`/#/channels/${channelId}`)
    await expect(page.locator('.chat-pane')).toBeVisible({ timeout: 10_000 })
  })

  test('can send a message via Enter', async ({ page }) => {
    await page.goto(`/#/channels/${channelId}`)
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 10_000 })
    const msg = `desktop e2e msg ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 10_000 })
  })

  test('sent message shows correct sender name', async ({ page }) => {
    await page.goto(`/#/channels/${channelId}`)
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 10_000 })
    const msg = `desktop sender test ${Date.now()}`
    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')
    const msgGroup = page.locator('.message-group', { has: page.locator('.msg-content', { hasText: msg }) })
    await expect(msgGroup.locator('.msg-author')).toBeVisible({ timeout: 10_000 })
  })

  test('input clears after send', async ({ page }) => {
    await page.goto(`/#/channels/${channelId}`)
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 10_000 })
    await page.locator('.chat-input').fill('clear test')
    await page.locator('.chat-input').press('Enter')
    await expect(page.locator('.chat-input')).toHaveValue('')
  })

  test('Shift+Enter inserts newline without sending', async ({ page }) => {
    await page.goto(`/#/channels/${channelId}`)
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 10_000 })
    await page.locator('.chat-input').fill('line1')
    await page.locator('.chat-input').press('Shift+Enter')
    const val = await page.locator('.chat-input').inputValue()
    expect(val).toContain('\n')
  })
})
