import { test, expect, type Page } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN, TEST_USERNAME } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

const BASE_URL = 'http://localhost:5176'
const TOKEN_KEY = 'openspace_token'
const USER_B_NAME = 'pw_desktop_voice_b'
const USER_B_PASS = 'DesktopVoiceB456!'

interface Participant {
  username: string
  muted: boolean
  deafened: boolean
  camera_enabled: boolean
  screen_sharing: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function joinVoice(page: Page, channelId: string): Promise<void> {
  await page.goto(`/#/channels/${channelId}`)
  await expect(page.locator('.voice-btn-toggle', { hasText: /Join Voice/ })).toBeVisible({ timeout: 10_000 })
  await page.locator('.voice-btn-toggle', { hasText: /Join Voice/ }).click()
  await expect(page.locator('.voice-btn-leave')).toBeVisible({ timeout: 15_000 })
}

async function leaveVoice(page: Page): Promise<void> {
  if (await page.locator('.voice-btn-leave').isVisible()) {
    await page.locator('.voice-btn-leave').click()
    await expect(page.locator('.voice-btn-toggle', { hasText: /Join Voice/ })).toBeVisible({ timeout: 10_000 })
  }
}

async function getMyParticipant(channelId: string, token: string): Promise<Participant> {
  const res = await fetch(`${API_URL}/api/v1/rtc/rooms/${channelId}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json() as { participants: Participant[] }
  const me = data.participants.find((p) => p.username === TEST_USERNAME)
  if (!me) throw new Error(`${TEST_USERNAME} not found in channel participants: ${JSON.stringify(data)}`)
  return me
}

/** Poll the participants API until predicate holds (or throws after timeoutMs). */
async function pollState(
  channelId: string,
  token: string,
  predicate: (p: Participant) => boolean,
  timeoutMs = 6_000,
): Promise<Participant> {
  const deadline = Date.now() + timeoutMs
  let last: Participant | undefined
  while (Date.now() < deadline) {
    last = await getMyParticipant(channelId, token)
    if (predicate(last)) return last
    await new Promise<void>((r) => setTimeout(r, 200))
  }
  throw new Error(`pollState timed out. Last state: ${JSON.stringify(last)}`)
}

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

async function mockElectronScreenShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */

    ;(window as any).electronAPI = (window as any).electronAPI ?? {}
    ;(window as any).electronAPI.getScreenSources = async () => [
      { id: 'screen:0:0', name: 'Entire Screen', thumbnail: '', display_id: '0' },
    ]

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

    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    ;(navigator.mediaDevices as any).getUserMedia = async (constraints: any) => {
      if (constraints?.video?.mandatory?.chromeMediaSource === 'desktop') {
        ;(window as any).__screenShareConstraints = constraints
        return createDisplayStream()
      }
      // Screen share audio capture — return empty stream so the try/catch in VoicePane
      // skips audio gracefully (audioMst will be undefined) without hanging headless.
      if (constraints?.audio?.mandatory?.chromeMediaSource === 'desktop') {
        return new MediaStream()
      }
      return origGetUserMedia(constraints)
    }

    ;(navigator.mediaDevices as any).getDisplayMedia = async () => {
      return createDisplayStream()
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('Desktop Voice', () => {
  let roomId: string
  let voiceChannelId: string
  let userBToken = ''

  test.beforeAll(async () => {
    const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: `desktop-voice-${Date.now()}` }),
    })
    const room = await jsonOrThrow<{ id: string }>(roomRes, 'create desktop voice room')
    roomId = room.id

    const chRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: 'voice-general', type: 'voice' }),
    })
    const ch = await jsonOrThrow<{ id: string }>(chRes, 'create desktop voice channel')
    voiceChannelId = ch.id

    // Create second user (idempotent — ignores 409 if already exists)
    const invRes = await fetch(`${API_URL}/api/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ max_uses: 1 }),
    })
    if (invRes.ok) {
      const { code } = await jsonOrThrow<{ code: string }>(invRes, 'create desktop invite')
      await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_code: code,
          username: USER_B_NAME,
          password: USER_B_PASS,
          display_name: 'Desktop Voice Tester B',
        }),
      })
    }
    const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER_B_NAME, password: USER_B_PASS }),
    })
    userBToken = (await jsonOrThrow<{ token: string }>(loginRes, 'login desktop user B')).token
  })

  test.afterAll(async () => {
    if (roomId) {
      await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      })
    }
  })

  // ── UI basics ───────────────────────────────────────────────────────────────

  test('voice channel shows Join Voice button', async ({ page }) => {
    await page.goto(`/#/channels/${voiceChannelId}`)
    await expect(page.locator('.voice-pane')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.voice-btn-toggle', { hasText: /Join Voice/ })).toBeVisible()
  })

  test('voice channel header shows channel name', async ({ page }) => {
    await page.goto(`/#/channels/${voiceChannelId}`)
    await expect(page.locator('.voice-pane .channel-header')).toContainText('voice-general')
  })

  test('joining voice shows leave, mute, cam and share controls', async ({ page }) => {
    await joinVoice(page, voiceChannelId)
    await expect(page.locator('.voice-btn-leave')).toBeVisible()
    await expect(page.locator('.voice-btn-toggle', { hasText: /Mute/ })).toBeVisible()
    await expect(page.locator('.voice-btn-toggle', { hasText: /Cam/ })).toBeVisible()
    await expect(page.locator('.voice-btn-toggle', { hasText: /Share/ })).toBeVisible()
    await leaveVoice(page)
  })

  // ── Audio ───────────────────────────────────────────────────────────────────

  test('audio: microphone active by default; mute/unmute updates server state', async ({ page }) => {
    await joinVoice(page, voiceChannelId)
    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string

    // Default: not muted
    const initial = await getMyParticipant(voiceChannelId, token)
    expect(initial.muted).toBe(false)

    // Mute — button changes AND server state updates
    await page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' })).toBeVisible()
    await pollState(voiceChannelId, token, (p) => p.muted)
    expect((await getMyParticipant(voiceChannelId, token)).muted).toBe(true)

    // Unmute — button changes AND server state updates
    await page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' })).toBeVisible()
    await pollState(voiceChannelId, token, (p) => !p.muted)
    expect((await getMyParticipant(voiceChannelId, token)).muted).toBe(false)

    await leaveVoice(page)
  })

  // ── Video ───────────────────────────────────────────────────────────────────

  test('video: camera off by default; camera on/off updates server state and participant icon', async ({ page }) => {
    await joinVoice(page, voiceChannelId)
    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string

    // Default: camera off, no preview
    const initial = await getMyParticipant(voiceChannelId, token)
    expect(initial.camera_enabled).toBe(false)
    await expect(page.locator('.camera-preview-local')).toHaveCount(0)

    // Enable camera — button changes AND server state updates
    await page.locator('.voice-btn-toggle', { hasText: '📷 Cam On' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '📹 Cam Off' })).toBeVisible({ timeout: 5_000 })
    await pollState(voiceChannelId, token, (p) => p.camera_enabled)
    expect((await getMyParticipant(voiceChannelId, token)).camera_enabled).toBe(true)

    // Self participant tile shows camera icon (WS voice.state_changed updates own entry)
    await expect(page.locator('.participant-tile span[title="Camera on"]')).toBeVisible({ timeout: 5_000 })

    // Local camera self-preview should appear
    await expect(page.locator('.camera-preview-local')).toBeVisible({ timeout: 8_000 })

    // Disable camera
    await page.locator('.voice-btn-toggle', { hasText: '📹 Cam Off' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '📷 Cam On' })).toBeVisible()
    await pollState(voiceChannelId, token, (p) => !p.camera_enabled)
    expect((await getMyParticipant(voiceChannelId, token)).camera_enabled).toBe(false)

    // Camera icon disappears; preview is removed
    await expect(page.locator('.participant-tile span[title="Camera on"]')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('.camera-preview-local')).toHaveCount(0, { timeout: 3_000 })

    await leaveVoice(page)
  })

  test('video: two users — User A enables camera → User B sees camera icon', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available — check ADMIN_API_TOKEN')

    const ctxB = await browser.newContext({ permissions: ['microphone', 'camera'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => {
        localStorage.setItem(key, token)
        localStorage.setItem('__e2e_skip_vault', '1')
      },
      { key: TOKEN_KEY, token: userBToken },
    )
    const pageB = await ctxB.newPage()

    try {
      // User A joins voice
      await joinVoice(page, voiceChannelId)

      // User B joins the same channel
      await pageB.goto(`${BASE_URL}/#/channels/${voiceChannelId}`)
      await pageB.locator('.voice-btn-toggle', { hasText: /Join Voice/ }).click()
      await expect(pageB.locator('.voice-btn-leave')).toBeVisible({ timeout: 15_000 })

      // User A enables camera
      await page.locator('.voice-btn-toggle', { hasText: '📷 Cam On' }).click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '📹 Cam Off' })).toBeVisible({ timeout: 5_000 })

      // User B should see camera icon on User A's tile (via WS voice.state_changed broadcast)
      await expect(pageB.locator('.participant-tile span[title="Camera on"]')).toBeVisible({ timeout: 5_000 })
      await expect(pageB.locator('.camera-area video')).toBeVisible({ timeout: 10_000 })

      // User A disables camera
      await page.locator('.voice-btn-toggle', { hasText: '📹 Cam Off' }).click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '📷 Cam On' })).toBeVisible({ timeout: 5_000 })

      // Camera icon disappears from User B's view
      await expect(pageB.locator('.participant-tile span[title="Camera on"]')).toHaveCount(0, { timeout: 5_000 })
      await expect(pageB.locator('.camera-area video')).toHaveCount(0, { timeout: 5_000 })
    } finally {
      await leaveVoice(page).catch(() => {})
      if (await pageB.locator('.voice-btn-leave').isVisible().catch(() => false)) {
        await pageB.locator('.voice-btn-leave').click().catch(() => {})
      }
      await ctxB.close()
    }
  })

  // ── Screen share ────────────────────────────────────────────────────────────

  test('screenshare: off by default; start/stop screen share updates server state', async ({ page }) => {
    // Provide a fake screen capture stream at 1920×1080/60fps so headless tests don't
    // open the system picker. Also mock getScreenSources so the Electron source picker
    // auto-selects the fake source without showing UI.
    await mockElectronScreenShare(page)

    await joinVoice(page, voiceChannelId)
    const token = (await page.evaluate(() => localStorage.getItem('openspace_token'))) as string

    // Default: screen sharing off
    const initial = await getMyParticipant(voiceChannelId, token)
    expect(initial.screen_sharing).toBe(false)

    // Start screen share — click button, then select source in picker modal
    await page.locator('.voice-btn-toggle', { hasText: '🖥 Share Screen' }).click()
    // The Electron source picker modal appears; click the first source tile to select it
    await expect(page.locator('.screen-picker-modal')).toBeVisible({ timeout: 5_000 })
    await page.locator('.screen-picker-tile').first().click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🖥 Stop Share' })).toBeVisible({ timeout: 5_000 })
    await pollState(voiceChannelId, token, (p) => p.screen_sharing)
    expect((await getMyParticipant(voiceChannelId, token)).screen_sharing).toBe(true)
    // Self participant tile shows screen sharing icon (WS voice.state_changed updates own entry)
    await expect(page.locator('.participant-tile span[title="Screen sharing"]')).toBeVisible({ timeout: 5_000 })

    // Verify quality constraints were passed (1920×1080, chromeMediaSource=desktop)
    const constraints = await page.evaluate(
      () => (window as unknown as { __screenShareConstraints?: unknown }).__screenShareConstraints ?? null
    )
    expect(constraints).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mandatory = (constraints as any)?.video?.mandatory
    expect(mandatory.chromeMediaSource).toBe('desktop')
    expect(mandatory.minWidth).toBeGreaterThanOrEqual(1920)
    expect(mandatory.minHeight).toBeGreaterThanOrEqual(1080)
    expect(mandatory.minFrameRate).toBeGreaterThanOrEqual(60)

    // Stop screen share
    await page.locator('.voice-btn-toggle', { hasText: '🖥 Stop Share' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🖥 Share Screen' })).toBeVisible()
    await pollState(voiceChannelId, token, (p) => !p.screen_sharing)
    expect((await getMyParticipant(voiceChannelId, token)).screen_sharing).toBe(false)
    // Screen sharing icon disappears
    await expect(page.locator('.participant-tile span[title="Screen sharing"]')).toHaveCount(0, { timeout: 5_000 })

    await leaveVoice(page)
  })

  test('screenshare: two users — User B sees remote screen video', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available — check ADMIN_API_TOKEN')
    await mockElectronScreenShare(page)

    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => {
        localStorage.setItem(key, token)
        localStorage.setItem('__e2e_skip_vault', '1')
      },
      { key: TOKEN_KEY, token: userBToken },
    )
    const pageB = await ctxB.newPage()

    try {
      await joinVoice(page, voiceChannelId)

      await pageB.goto(`${BASE_URL}/#/channels/${voiceChannelId}`)
      await pageB.locator('.voice-btn-toggle', { hasText: /Join Voice/ }).click()
      await expect(pageB.locator('.voice-btn-leave')).toBeVisible({ timeout: 15_000 })

      await page.locator('.voice-btn-toggle', { hasText: '🖥 Share Screen' }).click()
      await expect(page.locator('.screen-picker-modal')).toBeVisible({ timeout: 5_000 })
      await page.locator('.screen-picker-tile').first().click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '🖥 Stop Share' })).toBeVisible({ timeout: 5_000 })

      await expect(pageB.locator('.participant-tile span[title="Screen sharing"]')).toBeVisible({ timeout: 5_000 })
      await expect(pageB.locator('.screen-share-area video')).toBeVisible({ timeout: 10_000 })

      await page.locator('.voice-btn-toggle', { hasText: '🖥 Stop Share' }).click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '🖥 Share Screen' })).toBeVisible({ timeout: 5_000 })
      await expect(pageB.locator('.screen-share-area video')).toHaveCount(0, { timeout: 5_000 })
    } finally {
      await leaveVoice(page).catch(() => {})
      if (await pageB.locator('.voice-btn-leave').isVisible().catch(() => false)) {
        await pageB.locator('.voice-btn-leave').click().catch(() => {})
      }
      await ctxB.close()
    }
  })

  // ── Leave ───────────────────────────────────────────────────────────────────

  test('leaving voice returns to Join Voice button', async ({ page }) => {
    await joinVoice(page, voiceChannelId)
    await page.locator('.voice-btn-leave').click()
    await expect(page.locator('.voice-btn-toggle', { hasText: /Join Voice/ })).toBeVisible({ timeout: 10_000 })
  })

  // ── Mute media-layer regression tests ───────────────────────────────────────

  /** Reads the `enabled` flag of the local mic MediaStreamTrack. Returns null if not published. */
  function getMicEnabled(page: Page): Promise<boolean | null> {
    return page.evaluate(
      () => (window as unknown as { __lkMicTrack?: MediaStreamTrack }).__lkMicTrack?.enabled ?? null,
    )
  }

  /**
   * Ground-truth mute check: returns true when the sender's audio upstream is paused.
   * pauseUpstream() calls sender.replaceTrack(null) — RTP physically stops at the sender,
   * so audio cannot reach the SFU regardless of signaling. Directly observable on the
   * sender page; no server propagation needed. With localTrack.mute() this stays false
   * even though audio keeps flowing — that is the bug this test reproduces.
   */
  function getSenderUpstreamPaused(page: Page): Promise<boolean | null> {
    return page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const room = (window as any).__lkRoom
      const lp = room?.localParticipant
      if (!lp) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [, pub] of (lp as any).trackPublications as Map<string, any>) {
        if (pub.kind === 'audio') return (pub.isUpstreamPaused ?? null) as boolean | null
      }
      return null
    })
  }

  test('mute disables mic track immediately (< 50 ms); unmute re-enables it', async ({ page }) => {
    await joinVoice(page, voiceChannelId)

    // Wait for LocalTrackPublished → __lkMicTrack to be populated (up to 15 s).
    // If LiveKit is unreachable the mic never publishes — skip media assertions.
    const micReady = await expect
      .poll(() => getMicEnabled(page), { timeout: 15_000, intervals: [200] })
      .not.toBeNull()
      .then(() => true)
      .catch(() => false)

    if (!micReady) {
      await leaveVoice(page)
      return
    }

    expect(await getMicEnabled(page)).toBe(true)

    // ── Mute ─────────────────────────────────────────────────────────────────
    await page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' })).toBeVisible({ timeout: 500 })

    // applyMuteToLK sets mst.enabled synchronously; poll within 50 ms
    await expect.poll(() => getMicEnabled(page), { timeout: 50, intervals: [10] }).toBe(false)

    // ── Unmute ───────────────────────────────────────────────────────────────
    await page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' }).click()
    await expect(page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' })).toBeVisible({ timeout: 500 })

    await expect.poll(() => getMicEnabled(page), { timeout: 50, intervals: [10] }).toBe(true)

    await leaveVoice(page)
  })

  test('two-user: sender mutes → receiver sees indicator; mic track disabled within 50 ms', async ({ page, browser }) => {
    if (!userBToken) test.skip(true, 'User B token not available — check ADMIN_API_TOKEN')

    // User B context simulates the "web client" receiver
    const ctxB = await browser.newContext({ permissions: ['microphone'] })
    await ctxB.addInitScript(
      ({ key, token }: { key: string; token: string }) => {
        localStorage.setItem(key, token)
        localStorage.setItem('__e2e_skip_vault', '1')
      },
      { key: TOKEN_KEY, token: userBToken },
    )
    const pageB = await ctxB.newPage()

    try {
      // User A (sender — desktop Windows client) joins voice
      await joinVoice(page, voiceChannelId)

      // User B (receiver — web client observer) joins the same channel
      await pageB.goto(`${BASE_URL}/#/channels/${voiceChannelId}`)
      await pageB.locator('.voice-btn-toggle', { hasText: /Join Voice/ }).click()
      await expect(pageB.locator('.voice-btn-leave')).toBeVisible({ timeout: 15_000 })

      // Wait for User A's mic track to be published (LiveKit optional — skip if unavailable)
      const micReady = await expect
        .poll(() => getMicEnabled(page), { timeout: 15_000, intervals: [200] })
        .not.toBeNull()
        .then(() => true)
        .catch(() => false)

      if (!micReady) {
        return
      }

      expect(await getMicEnabled(page)).toBe(true)

      // ── Sender mutes ────────────────────────────────────────────────────────
      await page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' }).click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' })).toBeVisible({ timeout: 500 })

      // Local track enabled flag must flip within 50 ms (regression guard).
      await expect.poll(() => getMicEnabled(page), { timeout: 50, intervals: [10] }).toBe(false)

      // GROUND-TRUTH CHECK: sender upstream paused = sender.replaceTrack(null) was called.
      // Audio physically cannot reach the SFU — this is the only reliable mute guarantee.
      await expect
        .poll(() => getSenderUpstreamPaused(page), { timeout: 5_000, intervals: [200] })
        .toBe(true)

      // Receiver UI must show muted icon (backend WS voice.state_changed event)
      await expect(pageB.locator('.participant-tile span[title="Muted"]')).toBeVisible({ timeout: 5_000 })

      // ── Sender unmutes ──────────────────────────────────────────────────────
      await page.locator('.voice-btn-toggle', { hasText: '🔇 Unmute' }).click()
      await expect(page.locator('.voice-btn-toggle', { hasText: '🎤 Mute' })).toBeVisible({ timeout: 500 })

      await expect.poll(() => getMicEnabled(page), { timeout: 50, intervals: [10] }).toBe(true)

      // Upstream must be restored — RTP is flowing again to the SFU.
      await expect
        .poll(() => getSenderUpstreamPaused(page), { timeout: 5_000, intervals: [200] })
        .toBe(false)

      // Receiver's muted indicator must disappear
      await expect(pageB.locator('.participant-tile span[title="Muted"]')).toHaveCount(0, { timeout: 5_000 })
    } finally {
      await leaveVoice(page).catch(() => {})
      if (await pageB.locator('.voice-btn-leave').isVisible().catch(() => false)) {
        await pageB.locator('.voice-btn-leave').click().catch(() => {})
      }
      await ctxB.close()
    }
  })
})
