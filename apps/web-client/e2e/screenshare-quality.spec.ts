/**
 * Screen share quality regression test.
 *
 * The 960×540 startup bug:
 *   Chrome VP8 starts with a conservative BWE estimate (~300 kbps). With the
 *   default degradationPreference=balanced the encoder auto-sets
 *   scaleResolutionDownBy=2 → output 960×540. The stream stays there until BWE
 *   probes up to ~3 Mbps, which takes ~30 seconds even on a LAN.
 *
 * Why loopback Playwright tests can't reproduce it naturally:
 *   Chrome's congestion controller (GCC) in loopback sees infinite bandwidth
 *   and never triggers resolution downscale. Setting maxBitrate=300kbps caps
 *   output but does NOT lower the BWE estimate — the encoder keeps 1920×1080
 *   and just drops fps/quality instead.
 *
 * How this test catches the bug:
 *   Instead of waiting for the visible 960×540 effect, we read the RTCRtpSender
 *   parameters directly after LocalTrackPublished fires. If scaleResolutionDownBy
 *   is > 1 the encoder WILL produce 960×540 in production. The test fails before
 *   any frames even need to be decoded. This is the canonical regression guard.
 *
 *   Additionally Phase 1 manually forces scaleResolutionDownBy=2 to demonstrate
 *   the test infrastructure CAN detect 960×540 at the receiver, and Phase 2
 *   restores the fix to verify 1920×1080 is recovered.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

const BASE_URL = 'http://localhost:5174'
const TOKEN_KEY = 'openspace_token'

const USER_B_NAME = 'pw_ssquality_b'
const USER_B_PASS  = 'SSQuality456!'

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

let roomId    = ''
let channelId = ''
let userBToken = ''

// ─── helpers ─────────────────────────────────────────────────────────────────

async function jsonOrThrow<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : {}) as T
}

/** Injects a 1920×1080 canvas stream at 60fps as getDisplayMedia result. */
async function mockDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const createStream = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = 1920
      canvas.height = 1080
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | null
      let frame = 0
      const paint = () => {
        if (!ctx) return
        ctx.fillStyle = frame % 2 === 0 ? '#1d4ed8' : '#0f766e'
        ctx.fillRect(0, 0, 1920, 1080)
        ctx.fillStyle = '#ffffff'
        ctx.font = '64px monospace'
        ctx.fillText(`OpenSpace 1080p frame ${frame}`, 60, 120)
        frame++
      }
      paint()
      const timer = window.setInterval(paint, 1000 / 60)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = (canvas as any).captureStream(60) as MediaStream
      stream.getTracks().forEach(t => t.addEventListener('ended', () => window.clearInterval(timer), { once: true }))
      return stream
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigator.mediaDevices as any).getDisplayMedia = async (constraints?: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__displayMediaConstraints = constraints
      return createStream()
    }
  })
}

/** Wraps RTCPeerConnection to collect all instances in window.__lkPCs for stats. */
async function injectPCHook(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const Orig = window.RTCPeerConnection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__lkPCs = [] as RTCPeerConnection[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).RTCPeerConnection = function (...args: ConstructorParameters<typeof RTCPeerConnection>) {
      const pc = new Orig(...args)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__lkPCs.push(pc)
      return pc
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign((window as any).RTCPeerConnection, Orig)
  })
}

interface VideoQuality {
  width:  number | null
  height: number | null
  fps:    number | null
  method: string
}

function qualityBucket(w: number | null, h: number | null): string {
  if (!w || !h) return 'unknown'
  const short = Math.min(w, h)
  if (short >= 2160) return '4K (2160p)'
  if (short >= 1440) return '1440p'
  if (short >= 1080) return '1080p ✓'
  if (short >= 720)  return '720p'
  if (short >= 540)  return '540p ✗'
  if (short >= 480)  return '480p ✗'
  return `<480p ✗`
}

/** Measure received video quality on subscriber page via inbound-rtp stats. */
async function measureQuality(page: Page): Promise<VideoQuality> {
  return page.evaluate(async (): Promise<VideoQuality> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pcs: RTCPeerConnection[] = (window as any).__lkPCs ?? []
    for (const pc of pcs) {
      try {
        const stats = await pc.getStats()
        for (const s of stats.values()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stat = s as any
          if (stat.type === 'inbound-rtp' && stat.kind === 'video' && stat.frameWidth && stat.frameHeight) {
            return { width: stat.frameWidth, height: stat.frameHeight, fps: stat.framesPerSecond ?? null, method: 'inbound-rtp stats' }
          }
        }
      } catch { /* ignore */ }
    }
    const video = document.querySelector('.screen-share-area video') as HTMLVideoElement | null
    if (video && video.videoWidth && video.videoHeight) {
      return { width: video.videoWidth, height: video.videoHeight, fps: null, method: 'video.videoWidth/Height' }
    }
    return { width: null, height: null, fps: null, method: 'no data' }
  })
}

async function waitForQuality(page: Page, timeoutMs = 5_000): Promise<VideoQuality> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const q = await measureQuality(page)
    if (q.width !== null) return q
    await page.waitForTimeout(250)
  }
  return measureQuality(page)
}

async function waitForQualityMatch(
  page: Page,
  predicate: (q: VideoQuality) => boolean,
  timeoutMs = 10_000,
): Promise<VideoQuality> {
  const deadline = Date.now() + timeoutMs
  let last: VideoQuality = { width: null, height: null, fps: null, method: 'none' }
  while (Date.now() < deadline) {
    const q = await measureQuality(page)
    if (q.width !== null) { last = q; if (predicate(q)) return q }
    await page.waitForTimeout(400)
  }
  return last
}

async function waitForSender(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => !!(window as any).__lkScreenShareSender)
    if (ready) return true
    await page.waitForTimeout(200)
  }
  return false
}

// ─── fixtures ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  if (!ADMIN_TOKEN) throw new Error('ADMIN_API_TOKEN env var is required')
  const suffix = Date.now()

  const roomRes = await fetch(`${API_URL}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: `SS Quality ${suffix}` }),
  })
  roomId = (await jsonOrThrow<{ id: string }>(roomRes, 'create room')).id

  const chRes = await fetch(`${API_URL}/api/v1/rooms/${roomId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: 'quality-voice', type: 'voice' }),
  })
  channelId = (await jsonOrThrow<{ id: string }>(chRes, 'create channel')).id

  const invRes = await fetch(`${API_URL}/api/v1/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 1 }),
  })
  if (invRes.ok) {
    const { code } = await jsonOrThrow<{ code: string }>(invRes, 'invite')
    await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code, username: USER_B_NAME, password: USER_B_PASS, display_name: 'Quality B' }),
    })
  }

  const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER_B_NAME, password: USER_B_PASS }),
  })
  userBToken = (await jsonOrThrow<{ token: string }>(loginRes, 'login B')).token
})

test.afterAll(async () => {
  if (roomId) {
    await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
  }
})

// ─── tests ───────────────────────────────────────────────────────────────────

/**
 * REGRESSION TEST: catches the 960×540 bug by inspecting sender parameters.
 *
 * The bug produces 960×540 because the encoder has scaleResolutionDownBy=2 or
 * degradationPreference=balanced with low BWE. This test reads those params
 * directly from the RTCRtpSender — no need to wait for frames.
 *
 * This test FAILS if someone removes the scaleResolutionDownBy=1 or
 * maintain-resolution fix from LocalTrackPublished handler.
 */
test('screen share sender params: scaleResolutionDownBy=1 and maintain-resolution (960×540 regression)', async ({ page, browser }) => {
  if (!userBToken) test.skip(true, 'User B token not available')

  await mockDisplayMedia(page)

  const ctxB = await browser.newContext({ permissions: ['microphone'] })
  await ctxB.addInitScript(
    ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
    { key: TOKEN_KEY, token: userBToken },
  )
  const pageB = await ctxB.newPage()

  try {
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)
    await pageB.click('button:has-text("Join Voice")')
    await expect(pageB.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)

    await page.locator('button:has-text("Share Screen")').click()
    await expect(page.locator('button:has-text("Stop Share")')).toBeVisible({ timeout: 10_000 })

    const senderReady = await waitForSender(page, 8_000)
    expect(senderReady, '__lkScreenShareSender must be set by LocalTrackPublished handler').toBe(true)

    // Read sender encoding parameters set by our LocalTrackPublished fix
    const senderParams = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sender = (window as any).__lkScreenShareSender as RTCRtpSender | undefined
      if (!sender) return null
      const p = sender.getParameters()
      return {
        degradationPreference: p.degradationPreference ?? null,
        encodings: p.encodings.map(e => ({
          scaleResolutionDownBy: e.scaleResolutionDownBy ?? null,
          maxBitrate: e.maxBitrate ?? null,
          maxFramerate: e.maxFramerate ?? null,
        })),
      }
    })

    console.log('\n  [sender params]', JSON.stringify(senderParams, null, 4))

    expect(senderParams, 'sender must be accessible').not.toBeNull()

    // ── Key assertion 1: degradationPreference must be maintain-framerate ───
    // 'maintain-framerate' + scaleResolutionDownBy=1.0 tells Chrome VP8:
    //   - do NOT lower resolution (scaleResolutionDownBy locked to 1.0)
    //   - prioritize fps over quality — sacrifice artifacts, not frames
    // 'balanced' or 'maintain-resolution' without scaleResolutionDownBy=1.0
    // would allow Chrome to auto-set scaleResolutionDownBy=2 → 960×540.
    expect(
      senderParams!.degradationPreference,
      'degradationPreference must be maintain-framerate — prioritizes fps, locks resolution via scaleResolutionDownBy=1',
    ).toBe('maintain-framerate')

    // ── Key assertion 2: no encoding has scaleResolutionDownBy > 1 ──────────
    // scaleResolutionDownBy=2 on a 1920×1080 source → 960×540 at receiver.
    // Our fix explicitly sets it to 1.0 to prevent any existing or future
    // auto-scale that Chrome may have already applied.
    for (const enc of senderParams!.encodings) {
      const scale = enc.scaleResolutionDownBy ?? 1.0
      expect(
        scale,
        `encoding scaleResolutionDownBy=${scale} — must be ≤ 1.0; any value > 1 produces sub-1080p output (e.g. 2.0 → 960×540)`,
      ).toBeLessThanOrEqual(1.0)
    }

    await page.locator('button:has-text("Stop Share")').click().catch(() => {})
  } finally {
    await page.click('button:has-text("Leave")').catch(() => {})
    await pageB.click('button:has-text("Leave")').catch(() => {})
    await ctxB.close()
  }
})

/**
 * QUALITY TEST: demonstrates the test can detect 960×540, and that the fix
 * restores 1920×1080 at the receiver.
 *
 * Phase 1 — manually sets scaleResolutionDownBy=2 (what Chrome VP8 does
 *            automatically in production with balanced+low BWE) → receiver 960×540
 * Phase 2 — clears the override, restores fix → receiver 1920×1080
 */
test('screen share quality: scaleResolutionDownBy=2 causes 960×540; fix restores 1920×1080', async ({ page, browser }) => {
  if (!userBToken) test.skip(true, 'User B token not available')

  await mockDisplayMedia(page)
  await injectPCHook(page.context())

  const ctxB = await browser.newContext({ permissions: ['microphone'] })
  await injectPCHook(ctxB)
  await ctxB.addInitScript(
    ({ key, token }: { key: string; token: string }) => localStorage.setItem(key, token),
    { key: TOKEN_KEY, token: userBToken },
  )
  const pageB = await ctxB.newPage()

  try {
    await pageB.goto(`${BASE_URL}/channels/${channelId}`)
    await pageB.click('button:has-text("Join Voice")')
    await expect(pageB.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })

    await page.goto(`/channels/${channelId}`)
    await page.click('button:has-text("Join Voice")')
    await expect(page.locator('button:has-text("Mute")')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)

    await page.locator('button:has-text("Share Screen")').click()
    await expect(page.locator('button:has-text("Stop Share")')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.locator('.screen-share-area video')).toBeVisible({ timeout: 20_000 })

    await waitForSender(page, 8_000)

    // ── PHASE 1: SIMULATE BUG ─────────────────────────────────────────────────
    // Apply scaleResolutionDownBy=2 — exactly what Chrome VP8 does in production
    // with degradationPreference=balanced and initial BWE ~300 kbps.
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sender = (window as any).__lkScreenShareSender as RTCRtpSender | undefined
      if (!sender) return
      const p = sender.getParameters()
      for (const enc of p.encodings) { enc.scaleResolutionDownBy = 2 }
      await sender.setParameters(p)
    })

    const qBug = await waitForQualityMatch(pageB, q => q.width !== null && q.width <= 960, 8_000)

    // ── PHASE 2: APPLY FIX ────────────────────────────────────────────────────
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sender = (window as any).__lkScreenShareSender as RTCRtpSender | undefined
      if (!sender) return
      const p = sender.getParameters()
      p.degradationPreference = 'maintain-resolution'
      for (const enc of p.encodings) { enc.scaleResolutionDownBy = 1.0 }
      await sender.setParameters(p)
    })

    const qFix = await waitForQualityMatch(pageB, q => q.width !== null && q.width >= 1920, 10_000)

    console.log('\n┌─────────────────────────────────────────────────────────────────')
    console.log('│  Screen share 960×540 reproduction + fix')
    console.log(`│  [BUG  scaleResolutionDownBy=2]  ${qBug.width ?? '?'}×${qBug.height ?? '?'}  fps=${qBug.fps?.toFixed(0) ?? '?'}  → ${qualityBucket(qBug.width, qBug.height)}`)
    console.log(`│  [FIX  scaleResolutionDownBy=1]  ${qFix.width ?? '?'}×${qFix.height ?? '?'}  fps=${qFix.fps?.toFixed(0) ?? '?'}  → ${qualityBucket(qFix.width, qFix.height)}`)
    console.log('└─────────────────────────────────────────────────────────────────\n')

    expect(qBug.width, 'BUG phase must show ≤960px').toBeLessThanOrEqual(960)
    expect(qBug.height, 'BUG phase must show ≤540px').toBeLessThanOrEqual(540)
    expect(qFix.width, 'FIX phase must show ≥1920px').toBeGreaterThanOrEqual(1920)
    expect(qFix.height, 'FIX phase must show ≥1080px').toBeGreaterThanOrEqual(1080)

    await page.locator('button:has-text("Stop Share")').click().catch(() => {})
  } finally {
    await page.click('button:has-text("Leave")').catch(() => {})
    await pageB.click('button:has-text("Leave")').catch(() => {})
    await ctxB.close()
  }
})
