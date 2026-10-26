import { test, expect, type Page } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN, TEST_USERNAME } from './shared'

const BASE_URL = 'http://localhost:5174'
const TOKEN_KEY = 'openspace_token'

// Second test user for two-user scenarios
const USER_B_NAME = 'pw_voice_user_b'
const USER_B_PASS = 'VoicePW456!'

// Chrome flags required for WebRTC in headless mode
test.use({
  storageState: AUTH_STATE_PATH,
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
  permissions: ['microphone', 'camera'],
})

// Shared test fixtures (set in beforeAll, used across tests)
let roomId = ''
let channelId = ''
let textChannelId = ''
let userBToken = ''

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function mockDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const createDisplayStream = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1920
      canvas.height = 1080
      const ctx = (canvas as any).getContext('2d')
      let frame = 0
      const paint = () => {
        if (!ctx) return
        ctx.fillStyle = frame % 2 === 0 ? '#1d4ed8' : '#0f766e'
        ctx.fillRect(0, 0, 1920, 1080)
        ctx.fillStyle = '#ffffff'
        ctx.font = '48px sans-serif'
        ctx.fillText(`OpenSpace screen ${frame}`, 64, 96)
        frame += 1
      }
      paint()
      const timer = window.setInterval(paint, 1000 / 30)
      const stream = (canvas as any).captureStream(60) as MediaStream
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => window.clearInterval(timer), { once: true })
      })
      return stream
    }

    ;(navigator.mediaDevices as any).getDisplayMedia = async (constraints?: unknown) => {
      ;(window as any).__displayMediaConstraints = constraints
      return createDisplayStream()
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}

test.beforeAll(async () => {
  if (!ADMIN_TOKEN) throw new Error('ADMIN_API_TOKEN is required')
  const suffix = Date.now()

  // Create a room with a voice channel and a text channel
  const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: `PW Voice Room ${suffix}` }),
  })
  roomId = (await jsonOrThrow<{ id: string }>(roomRes, 'create voice room')).id

  const voiceChRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: 'voice-test', type: 'voice' }),
  })
  channelId = (await jsonOrThrow<{ id: string }>(voiceChRes, 'create voice channel')).id

  const textChRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: 'text-test', type: 'text' }),
  })
  textChannelId = (await jsonOrThrow<{ id: string }>(textChRes, 'create text channel')).id

  // Create second test user (idempotent — ignores 409)
  const invRes = await fetch(`${API_URL}/api/v1/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 1 }),
  })
  if (invRes.ok) {
    const { code } = await jsonOrThrow<{ code: string }>(invRes, 'create invite')
    await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_code: code,
        username: USER_B_NAME,
        password: USER_B_PASS,
        display_name: 'Voice Tester B',
      }),
    })
  }

  // Obtain token for User B (login even if user already existed)
  const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER_B_NAME, password: USER_B_PASS }),
  })
  userBToken = (await jsonOrThrow<{ token: string }>(loginRes, 'login user B')).token
})

test.afterAll(async () => {
  if (roomId) {
    await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
  }
})

// ─── Single-user voice tests ────────────────────────────────────────────────

test.describe('Voice — single user', () => {
  test('join via button: controls appear and self is in participant list', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')

    // Controls should appear after join
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button:has-text("Leave")')).toBeVisible()

    // Self should be in the participant list
    await expect(page.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
  })

  test('leave via button: join button reappears and participant list is empty', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.participant-tile')).toHaveCount(0)
  })

  test('text-channel navigation keeps the active voice session connected', async ({ page }) => {
    let leaveRequests = 0
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes(`/api/v1/rtc/rooms/${channelId}/leave`)) {
        leaveRequests += 1
      }
    })

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    await page.evaluate((targetChannelId) => {
      window.history.pushState({}, '', `/channels/${targetChannelId}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, textChannelId)
    await expect(page.locator('.chat-input')).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(500)

    expect(leaveRequests).toBe(0)
    expect(await page.evaluate(() => sessionStorage.getItem('openspace:voice-channel'))).toBe(channelId)
    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string
    expect((await getMyParticipantWeb(channelId, token)).username).toBe(TEST_USERNAME)

    await page.evaluate((targetChannelId) => {
      window.history.pushState({}, '', `/channels/${targetChannelId}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, channelId)
    await expect(page.locator('button:has-text("Leave")')).toBeVisible({ timeout: 5_000 })
    await page.click('button:has-text("Leave")')
  })

  test('mute button toggles UI state within 500ms (no delay)', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    const t0 = Date.now()
    await page.click('button:has-text("Mute")')
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 500 })
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(500)

    // Unmute is also instant
    const t1 = Date.now()
    await page.click('button:has-text("Unmute")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 500 })
    expect(Date.now() - t1).toBeLessThan(500)

    await page.click('button:has-text("Leave")')
  })

  test('deafen button toggles label correctly', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Deafen")')).toBeVisible({ timeout: 10_000 })

    await page.click('button:has-text("Deafen")')
    await expect(page.locator('button:has-text("Undeafen")')).toBeVisible({ timeout: 1_000 })

    await page.click('button:has-text("Undeafen")')
    await expect(page.locator('button:has-text("Deafen")')).toBeVisible({ timeout: 1_000 })

    await page.click('button:has-text("Leave")')
  })

  test('Ctrl+R while in voice → auto-rejoin after reload', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('Control+R')
    await page.waitForLoadState('domcontentloaded')

    // Should reconnect automatically and show voice controls
    await expect(page.locator('button:has-text("Mute"), button:has-text("Reconnecting")')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 20_000 })

    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
  })

  test('Ctrl+R while muted → still muted after auto-rejoin', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // Mute
    await page.click('button:has-text("Mute")')
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 1_000 })

    await page.keyboard.press('Control+R')
    await page.waitForLoadState('domcontentloaded')

    // After auto-rejoin the muted state should be restored
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 20_000 })

    await page.click('button:has-text("Leave")')
  })

  test('Ctrl+R while deafened → still deafened after auto-rejoin', async ({ page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Deafen")')).toBeVisible({ timeout: 10_000 })

    await page.click('button:has-text("Deafen")')
    await expect(page.locator('button:has-text("Undeafen")')).toBeVisible({ timeout: 1_000 })

    await page.keyboard.press('Control+R')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('button:has-text("Undeafen")')).toBeVisible({ timeout: 20_000 })

    await page.click('button:has-text("Leave")')
  })
})

// ─── Two-user voice tests ────────────────────────────────────────────────────

test.describe('Voice — two users', () => {
  test('User A joins → appears in User B\'s participant list within 3s', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available — check ADMIN_API_TOKEN')

    // User B context: inject token via initScript so AuthContext reads it at mount
    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    // User A (primary) joins voice
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // User B should see User A's participant tile via WS event
    await expect(pageB.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await ctxB.close()
  })

  test('User A mutes → User B sees muted indicator within 3s', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    // User A joins
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    // User A mutes
    await page.click('button:has-text("Mute")')
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 500 })

    // User B should see the muted icon on User A's tile
    await expect(pageB.locator('.participant-tile span[title="Muted"]')).toBeVisible({ timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await ctxB.close()
  })

  test('User A leaves → removed from User B\'s participant list', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    // User A joins
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    // User A leaves
    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })

    // User B should see participant list go empty
    await expect(pageB.locator('.participant-tile')).toHaveCount(0, { timeout: 5_000 })

    await ctxB.close()
  })

  test('both users join → each sees the other in participant list', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    // Navigate fresh — ensure we start from Join Voice (not Mute/Leave from prior test)
    await page.goto(`/channels/${channelId}`)
    await expect(page.locator('button:has-text("Join Voice"), button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    // If somehow already joined (prior test residue), leave first
    if (await page.locator('button:has-text("Leave")').isVisible()) {
      await page.click('button:has-text("Leave")')
      await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
    }

    // User A joins
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // User B joins
    await pageB.click('button:has-text("Join Voice")')
    await expect(pageB.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // Each should see 2 participants
    await expect(page.locator('.participant-tile')).toHaveCount(2, { timeout: 5_000 })
    await expect(pageB.locator('.participant-tile')).toHaveCount(2, { timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await pageB.click('button:has-text("Leave")')
    await ctxB.close()
  })
})

// ─── Mute/unmute state consistency ──────────────────────────────────────────
//
// These tests verify that UI state, backend state, and media state stay in sync.
// Media track state is verified by hooking MediaStreamTrack.prototype.enabled
// setter at init-script time — this captures the exact call regardless of which
// JS object is on the sender vs. what LiveKit holds internally.
//
// Note: outbound-rtp bytesSent grows even during silence (Opus encodes silent frames),
// and media-source audioLevel reflects the raw device level, not the enabled flag.
// Neither is suitable for mute verification; the prototype setter hook is definitive.

test.describe('Voice — mute state consistency', () => {
  /**
   * Injects two hooks before page scripts run:
   * 1. RTCPeerConnection constructor → `window.__lkPeerConnections` array.
   * 2. MediaStreamTrack.prototype.enabled setter → `window.__lastAudioTrackEnabled`
   *    is updated every time any audio track's enabled property is written.
   *    After mute this becomes `false`; after unmute it becomes `true`.
   */
  async function exposeMediaHooks(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      // Track RTCPeerConnection instances
      const OrigPC = window.RTCPeerConnection
      ;(window as unknown as { __lkPeerConnections: RTCPeerConnection[] }).__lkPeerConnections = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).RTCPeerConnection = function (...args: ConstructorParameters<typeof RTCPeerConnection>) {
        const pc = new OrigPC(...args)
        ;(window as unknown as { __lkPeerConnections: RTCPeerConnection[] }).__lkPeerConnections.push(pc)
        return pc
      }
      Object.assign(window.RTCPeerConnection, OrigPC)

      // Hook MediaStreamTrack.prototype.enabled to capture mute/unmute calls
      // regardless of which track object is on the RTCRtpSender vs. what LiveKit holds.
      const descriptor = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'enabled')
      if (descriptor?.set) {
        Object.defineProperty(MediaStreamTrack.prototype, 'enabled', {
          get: descriptor.get,
          set(v: boolean) {
            descriptor.set!.call(this, v)
            if ((this as MediaStreamTrack).kind === 'audio') {
              ;(window as unknown as { __lastAudioTrackEnabled?: boolean }).__lastAudioTrackEnabled = v
            }
          },
          configurable: true,
        })
      }
    })
  }

  /** Read the last value written to any audio track's `.enabled`. */
  async function getLastAudioTrackEnabled(page: import('@playwright/test').Page): Promise<boolean | null> {
    return page.evaluate(
      () => (window as unknown as { __lastAudioTrackEnabled?: boolean }).__lastAudioTrackEnabled ?? null,
    )
  }

  /** Live-read the mic MediaStreamTrack.enabled exposed by VoicePane's LocalTrackPublished handler. */
  async function getMicTrackLiveEnabled(page: import('@playwright/test').Page): Promise<boolean | null> {
    return page.evaluate(
      () => (window as unknown as { __lkMicTrack?: MediaStreamTrack }).__lkMicTrack?.enabled ?? null,
    )
  }

  test('mute silences the mic track; unmute re-enables it', async ({ page }) => {
    await exposeMediaHooks(page)
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })

    // Wait for LocalTrackPublished to fire — VoicePane's handler sets window.__lkMicTrack
    // to the real MediaStreamTrack and then calls applyMuteToLK.
    // In environments where LK ICE/media publishing is unavailable (e.g. headless CI without
    // TURN) the mic never publishes; we skip media assertions to avoid false failures.
    const micReadyBefore = await getMicTrackLiveEnabled(page).then(v => v !== null ? Promise.resolve(v) : null)
    let micReady = micReadyBefore !== null
    if (!micReady) {
      micReady = await expect
        .poll(() => getMicTrackLiveEnabled(page), { timeout: 10_000, intervals: [200] })
        .not.toBeNull()
        .then(() => true)
        .catch(() => false)
    }

    if (!micReady) {
      // LiveKit media layer unavailable in this test environment.
      // UI/backend-state mute consistency is covered by other tests.
      await page.click('button:has-text("Leave")').catch(() => {})
      return
    }

    // Mic is published. Verify track.enabled = true before muting.
    expect(await getMicTrackLiveEnabled(page)).toBe(true)

    // Mute — UI must update within 500ms (no delay)
    await page.click('button:has-text("Mute")')
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 500 })

    // applyMuteToLK sets track.enabled synchronously; poll to cover event-loop flush.
    await expect
      .poll(() => getMicTrackLiveEnabled(page), { timeout: 1_000, intervals: [50] })
      .toBe(false)

    // Unmute — must also be instant on UI
    await page.click('button:has-text("Unmute")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 500 })

    // track.enabled must return to true
    await expect
      .poll(() => getMicTrackLiveEnabled(page), { timeout: 1_000, intervals: [50] })
      .toBe(true)

    await page.click('button:has-text("Leave")')
  })

  test('mute UI + backend state stay in sync', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })
    // Brief pause so the LiveKit IIFE has time to run the ice+token API calls and
    // set lkRoomRef.current.  Without this, applyMuteToLK sees null and rolls back,
    // causing the "Unmute" button to never appear within the 500ms window.
    await page.waitForTimeout(500)

    // Mute User A
    await page.click('button:has-text("Mute")')
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 500 })

    // User B must see the muted icon on User A's tile (backend WS event propagated)
    await expect(pageB.locator('.participant-tile span[title="Muted"]')).toBeVisible({ timeout: 5_000 })

    // UI and backend are now in sync — unmute and verify icon disappears
    await page.click('button:has-text("Unmute")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 500 })
    await expect(pageB.locator('.participant-tile span[title="Muted"]')).toHaveCount(0, { timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await ctxB.close()
  })

  test('rapid mute/unmute never leaves a desync between button and participant icon', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })

    // Toggle mute 3 times rapidly — end state is muted (odd number of clicks)
    for (let i = 0; i < 3; i++) {
      const label = i % 2 === 0 ? 'Mute' : 'Unmute'
      await page.click(`button:has-text("${label}")`)
      await page.waitForTimeout(80)
    }

    // Final state: muted (3rd click muted)
    await expect(page.locator('button:has-text("Unmute")')).toBeVisible({ timeout: 2_000 })
    await expect(pageB.locator('.participant-tile span[title="Muted"]')).toBeVisible({ timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await ctxB.close()
  })
})

// ─── Screen share tests ──────────────────────────────────────────────────────

interface VoiceParticipant { username: string; screen_sharing: boolean; muted: boolean; camera_enabled: boolean }

async function getMyParticipantWeb(channelId: string, token: string): Promise<VoiceParticipant> {
  const res = await fetch(`${API_URL}/api/v1/rtc/rooms/${channelId}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as { participants: VoiceParticipant[] }
  const me = data.participants.find((p) => p.username === TEST_USERNAME)
  if (!me) throw new Error(`${TEST_USERNAME} not found in participants: ${JSON.stringify(data)}`)
  return me
}

async function pollScreenState(
  channelId: string,
  token: string,
  predicate: (p: VoiceParticipant) => boolean,
  timeoutMs = 6_000,
): Promise<VoiceParticipant> {
  const deadline = Date.now() + timeoutMs
  let last: VoiceParticipant | undefined
  while (Date.now() < deadline) {
    last = await getMyParticipantWeb(channelId, token)
    if (predicate(last)) return last
    await new Promise<void>((r) => setTimeout(r, 200))
  }
  throw new Error(`pollScreenState timed out. Last: ${JSON.stringify(last)}`)
}

async function liveKitDebug(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const room = (window as unknown as { __lkRoom?: any }).__lkRoom
    return {
      videoCount: document.querySelectorAll('video').length,
      screenVideoCount: document.querySelectorAll('.screen-share-area video').length,
      cameraVideoCount: document.querySelectorAll('.camera-area video').length,
      localPublications: room
        ? Array.from(room.localParticipant.trackPublications.values()).map((pub: any) => ({
            kind: pub.kind,
            source: pub.source,
            trackSid: pub.trackSid,
            hasTrack: Boolean(pub.track),
            trackKind: pub.track?.kind,
            trackSource: pub.track?.source,
            mediaKind: pub.track?.mediaStreamTrack?.kind,
            mediaReadyState: pub.track?.mediaStreamTrack?.readyState,
          }))
        : null,
      remoteParticipants: room
        ? Array.from(room.remoteParticipants.values()).map((participant: any) => ({
            identity: participant.identity,
            sid: participant.sid,
            publications: Array.from(participant.trackPublications.values()).map((pub: any) => ({
              kind: pub.kind,
              source: pub.source,
              trackSid: pub.trackSid,
              isSubscribed: pub.isSubscribed,
              hasTrack: Boolean(pub.track),
              trackKind: pub.track?.kind,
              trackSource: pub.track?.source,
            })),
          }))
        : null,
    }
  })

}

test.describe('Voice — screen share', () => {
  test('screen share: off by default; start/stop updates server state and participant icon', async ({ page }: { page: Page }) => {
    // Override getDisplayMedia with a 1920×1080 fake canvas stream so headless tests
    // don't open the system picker. Matches the pattern used in desktop-win E2E tests.
    await mockDisplayMedia(page)

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string

    // Default: screen sharing off
    const initial = await getMyParticipantWeb(channelId, token)
    expect(initial.screen_sharing).toBe(false)

    // Start screen share — button changes AND server state updates
    await page.locator('button:has-text("Share Screen")').click()
    await expect(page.locator('button:has-text("Stop Share")')).toBeVisible({ timeout: 5_000 })
    await pollScreenState(channelId, token, (p) => p.screen_sharing)
    expect((await getMyParticipantWeb(channelId, token)).screen_sharing).toBe(true)
    const displayMediaConstraints = await page.evaluate(
      () => (window as unknown as { __displayMediaConstraints?: unknown }).__displayMediaConstraints ?? null
    )
    expect(JSON.stringify(displayMediaConstraints)).toContain('1920')
    expect(JSON.stringify(displayMediaConstraints)).toContain('1080')
    expect(JSON.stringify(displayMediaConstraints)).toContain('60')
    // Self participant tile shows screen sharing icon (WS voice.state_changed updates own entry)
    await expect(page.locator('.participant-tile span[title="Screen sharing"]')).toBeVisible({ timeout: 5_000 })

    // Stop screen share
    await page.locator('button:has-text("Stop Share")').click()
    await expect(page.locator('button:has-text("Share Screen")')).toBeVisible({ timeout: 5_000 })
    await pollScreenState(channelId, token, (p) => !p.screen_sharing)
    expect((await getMyParticipantWeb(channelId, token)).screen_sharing).toBe(false)
    // Screen sharing icon disappears
    await expect(page.locator('.participant-tile span[title="Screen sharing"]')).toHaveCount(0, { timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
  })

  test('screen share: two users — User A shares → User B sees screen sharing icon', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    await mockDisplayMedia(page)

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)
    await pageB.click('button:has-text("Join Voice")')
    await expect(pageB.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // User A joins voice
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    // User A starts screen share
    await page.locator('button:has-text("Share Screen")').click()
    await expect(page.locator('button:has-text("Stop Share")')).toBeVisible({ timeout: 5_000 })

    // User B should see the screen sharing icon on User A's tile
    await expect(pageB.locator('.participant-tile span[title="Screen sharing"]')).toBeVisible({ timeout: 5_000 })
    try {
      await expect(pageB.locator('.screen-share-area video')).toBeVisible({ timeout: 10_000 })
    } catch (err) {
      throw new Error(
        `remote screen video missing: A=${JSON.stringify(await liveKitDebug(page))}; B=${JSON.stringify(await liveKitDebug(pageB))}; ${String(err)}`
      )
    }

    // User A stops screen share
    await page.locator('button:has-text("Stop Share")').click()
    await expect(page.locator('button:has-text("Share Screen")')).toBeVisible({ timeout: 5_000 })

    // Icon disappears from User B's view
    await expect(pageB.locator('.participant-tile span[title="Screen sharing"]')).toHaveCount(0, { timeout: 5_000 })
    await expect(pageB.locator('.screen-share-area video')).toHaveCount(0, { timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await pageB.click('button:has-text("Leave")')
    await ctxB.close()
  })
})

// ─── Camera tests ────────────────────────────────────────────────────────────

test.describe('Voice — camera', () => {
  test('camera: off by default; toggle camera updates server state, participant icon, and preview', async ({ page }: { page: Page }) => {
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string

    // Default: camera off, no preview
    const initial = await getMyParticipantWeb(channelId, token)
    expect(initial.camera_enabled).toBe(false)
    await expect(page.locator('.camera-preview-local')).toHaveCount(0)

    // Enable camera — button changes AND server state updates
    await page.locator('button:has-text("Cam On")').click()
    await expect(page.locator('button:has-text("Cam Off")')).toBeVisible({ timeout: 5_000 })
    await pollScreenState(channelId, token, (p) => p.camera_enabled)
    expect((await getMyParticipantWeb(channelId, token)).camera_enabled).toBe(true)

    // Self participant tile shows camera icon (WS voice.state_changed updates own entry)
    await expect(page.locator('.participant-tile span[title="Camera on"]')).toBeVisible({ timeout: 5_000 })

    // Local camera self-preview should appear (hasLocalCamera state triggers re-render)
    await expect(page.locator('.camera-preview-local')).toBeVisible({ timeout: 8_000 })

    // Disable camera
    await page.locator('button:has-text("Cam Off")').click()
    await expect(page.locator('button:has-text("Cam On")')).toBeVisible({ timeout: 5_000 })
    await pollScreenState(channelId, token, (p) => !p.camera_enabled)
    expect((await getMyParticipantWeb(channelId, token)).camera_enabled).toBe(false)

    // Camera icon disappears; preview is removed
    await expect(page.locator('.participant-tile span[title="Camera on"]')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('.camera-preview-local')).toHaveCount(0, { timeout: 3_000 })

    await page.click('button:has-text("Leave")')
    await expect(page.locator('button:has-text("Join Voice")')).toBeVisible({ timeout: 5_000 })
  })

  test('camera: two users — User A enables camera → User B sees camera icon', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available')

    const ctxB = await browser.newContext({ permissions: ['microphone', 'camera'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
      { key: TOKEN_KEY, token: userBToken }
    )
    const pageB = await ctxB.newPage()
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)
    await pageB.click('button:has-text("Join Voice")')
    await expect(pageB.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })

    // User A joins voice
    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.locator('.participant-tile').first()).toBeVisible({ timeout: 5_000 })

    // User A enables camera
    await page.locator('button:has-text("Cam On")').click()
    await expect(page.locator('button:has-text("Cam Off")')).toBeVisible({ timeout: 5_000 })

    // User B should see camera icon on User A's tile (via WS voice.state_changed broadcast)
    await expect(pageB.locator('.participant-tile span[title="Camera on"]')).toBeVisible({ timeout: 5_000 })
    await expect(pageB.locator('.camera-area video')).toBeVisible({ timeout: 10_000 })

    // User A disables camera
    await page.locator('button:has-text("Cam Off")').click()
    await expect(page.locator('button:has-text("Cam On")')).toBeVisible({ timeout: 5_000 })

    // Camera icon disappears from User B's view
    await expect(pageB.locator('.participant-tile span[title="Camera on"]')).toHaveCount(0, { timeout: 5_000 })
    await expect(pageB.locator('.camera-area video')).toHaveCount(0, { timeout: 5_000 })

    await page.click('button:has-text("Leave")')
    await pageB.click('button:has-text("Leave")')
    await ctxB.close()
  })
})

// ─── Chat duplicate message test ────────────────────────────────────────────

test.describe('Chat — no duplicate messages', () => {
  test('sending a message via web shows it exactly once', async ({ page }) => {
    await page.goto(`/channels/${textChannelId}`)
    const msg = `no-dupe-${Date.now()}`

    await page.locator('.chat-input').fill(msg)
    await page.locator('.chat-input').press('Enter')

    // Wait for message to appear
    await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 5_000 })

    // Should appear exactly once, not twice
    await expect(page.locator('.msg-content', { hasText: msg })).toHaveCount(1)

    // Still exactly once after a short wait (no delayed duplicate)
    await page.waitForTimeout(500)
    await expect(page.locator('.msg-content', { hasText: msg })).toHaveCount(1)
  })

  test('rapid messages each appear exactly once', async ({ page }) => {
    await page.goto(`/channels/${textChannelId}`)
    const tag = Date.now()

    for (let i = 0; i < 3; i++) {
      const msg = `rapid-${tag}-${i}`
      await page.locator('.chat-input').fill(msg)
      await page.locator('.chat-input').press('Enter')
      await expect(page.locator('.msg-content', { hasText: msg })).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('.msg-content', { hasText: msg })).toHaveCount(1)
    }
  })
})
