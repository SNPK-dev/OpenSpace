import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const requireFromDesktop = createRequire(path.join(root, 'apps/desktop-win/package.json'))
const { chromium, _electron: electron } = requireFromDesktop('@playwright/test')
const electronPath = requireFromDesktop('electron')

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5174'
const DESKTOP_URL = process.env.DESKTOP_URL ?? 'http://localhost:5173'
const DESKTOP_EXE = process.env.DESKTOP_EXE
  ?? path.join(root, 'apps/desktop-win/release/win-unpacked/OpenSpace.exe')
const USE_PACKAGED_DESKTOP = process.env.USE_PACKAGED_DESKTOP !== '0'
const START_WEB = process.env.START_WEB !== '0'
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN
  ?? (existsSync(path.join(root, '.admin_token')) ? readFileSync(path.join(root, '.admin_token'), 'utf8').trim() : '')
const SILENCE_TIMEOUT_MS = Number(process.env.SILENCE_TIMEOUT_MS ?? 60_000)
const AUDIBLE_LEVEL = Number(process.env.AUDIBLE_LEVEL ?? 0.015)
const SILENT_LEVEL = Number(process.env.SILENT_LEVEL ?? 0.006)
const SILENT_STABLE_MS = Number(process.env.SILENT_STABLE_MS ?? 1_000)
const AUDIO_SOURCE = process.env.AUDIO_SOURCE ?? 'oscillator'
const PLAY_SYSTEM_TONE = process.env.PLAY_SYSTEM_TONE !== '0'
const PROBE_MODE = process.env.PROBE_MODE ?? 'playback'
const WEB_HEADLESS = process.env.WEB_HEADLESS !== '0'
const TEST_MODE = process.env.TEST_MODE ?? 'latency'
const RECEIVER_MUTE = process.env.RECEIVER_MUTE !== '0'

const TOKEN_KEY = 'openspace_token'
const tag = Date.now()
const sender = { username: process.env.LATENCY_SENDER_USER ?? 'user_win', password: process.env.LATENCY_SENDER_PASS ?? 'Test1234!' }
const receiver = { username: process.env.LATENCY_RECEIVER_USER ?? 'user_web', password: process.env.LATENCY_RECEIVER_PASS ?? 'Test1234!' }
const electronEnv = { ...process.env }
delete electronEnv.ELECTRON_RUN_AS_NODE

const children = []
const fakeAudioPath = process.env.FAKE_AUDIO_PATH ?? path.join(os.tmpdir(), `openspace-mute-tone-${tag}.wav`)

function log(...args) {
  console.error('[mute-latency]', ...args.map((arg) => {
    if (typeof arg !== 'string') return arg
    return arg
      .replace(/access_token=[^&\s']+/g, 'access_token=<redacted>')
      .replace(/join_request=[^&\s']+/g, 'join_request=<redacted>')
  }))
}

function spawnServer(name, cwd, args) {
  const child = spawn('pnpm', args, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      OPENSPACE_API_URL: API_URL,
      OPENSPACE_WS_URL: 'ws://localhost:3001',
    },
  })
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`))
  children.push(child)
  return child
}

function killChildTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

function spawnSystemTone(durationSeconds = 30) {
  if (process.platform !== 'win32') return null
  const command = [
    '$deadline=(Get-Date).AddSeconds(' + durationSeconds + ');',
    'while((Get-Date) -lt $deadline){',
    '[console]::beep(880,180);',
    'Start-Sleep -Milliseconds 40',
    '}',
  ].join(' ')
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.stderr.on('data', (d) => process.stderr.write(`[system-tone] ${d}`))
  children.push(child)
  return child
}

function ensureFakeAudioFile(filePath) {
  if (existsSync(filePath)) return filePath

  const sampleRate = 48_000
  const durationSeconds = 120
  const channelCount = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const dataBytes = sampleRate * durationSeconds * channelCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataBytes)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channelCount, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28)
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)

  const amplitude = 16_000
  for (let i = 0; i < sampleRate * durationSeconds; i += 1) {
    const t = i / sampleRate
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * 440 * t))
    buffer.writeInt16LE(sample, 44 + i * bytesPerSample)
  }

  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, buffer)
  return filePath
}

function mediaFlags(audioPath) {
  const flags = [
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ]
  if (AUDIO_SOURCE === 'fake-file') {
    flags.push('--use-fake-device-for-media-stream')
    flags.push(`--use-file-for-fake-audio-capture=${audioPath}`)
  }
  return flags
}

async function installDesktopOscillatorMic(page) {
  await page.addInitScript(() => {
    const w = window
    if (w.__openspaceOscillatorMicInstalled) return
    w.__openspaceOscillatorMicInstalled = true

    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })
    }

    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const wantsAudio = constraints === true
        || constraints?.audio === true
        || (typeof constraints?.audio === 'object' && constraints.audio !== null)
      const wantsVideo = constraints === true
        || constraints?.video === true
        || (typeof constraints?.video === 'object' && constraints.video !== null)

      if (!wantsAudio || wantsVideo) {
        if (originalGetUserMedia) return originalGetUserMedia(constraints)
        throw new DOMException('Only oscillator audio is supported by this test shim', 'NotSupportedError')
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const destination = ctx.createMediaStreamDestination()
      oscillator.type = 'sine'
      oscillator.frequency.value = 440
      gain.gain.value = 0.35
      oscillator.connect(gain)
      gain.connect(destination)
      oscillator.start()
      await ctx.resume().catch(() => {})

      w.__openspaceOscillatorMic = { ctx, oscillator, gain, stream: destination.stream }
      return destination.stream
    }
  })
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastErr
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastErr?.message ?? 'no response'}`)
}

async function api(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} -> ${res.status}: ${text}`)
  return body
}

async function createInvite() {
  const data = await api('/api/v1/invites', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ max_uses: 1 }),
  })
  return data.code
}

async function registerAndLogin(user) {
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: user.username, password: user.password }),
  })
  return login.token
}

async function createRoomAndChannel() {
  const room = await api('/api/v1/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: `latency-room-${tag}` }),
  })
  const channel = await api(`/api/v1/rooms/${room.id}/channels`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: 'latency-voice', type: 'voice' }),
  })
  return { roomId: room.id, channelId: channel.id }
}

async function deleteRoom(roomId) {
  await fetch(`${API_URL}/api/v1/rooms/${roomId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  }).catch(() => {})
}

async function installAudioProbe(page) {
  await page.evaluate(({ audibleLevel }) => {
    const w = window
    w.__muteProbe = {
      ctx: null,
      playbackAnalyser: null,
      playbackData: null,
      rawAnalyser: null,
      rawData: null,
      sources: new WeakMap(),
      playbackStreamSources: new WeakMap(),
      streamSources: new WeakMap(),
      lastAudibleAt: 0,
      lastAudibleWallAt: 0,
      startedAt: performance.now(),
      ensureAnalyser(name) {
        const analyserKey = `${name}Analyser`
        const dataKey = `${name}Data`
        if (!this[analyserKey]) {
          this[analyserKey] = this.ctx.createAnalyser()
          this[analyserKey].fftSize = 2048
          this[dataKey] = new Uint8Array(this[analyserKey].fftSize)
        }
        return this[analyserKey]
      },
      async init() {
        if (!this.ctx) this.ctx = new AudioContext()
        if (this.ctx.state !== 'running') await this.ctx.resume()
        const playbackAnalyser = this.ensureAnalyser('playback')
        const rawAnalyser = this.ensureAnalyser('raw')
        if (!playbackAnalyser.__connectedToDestination) {
          playbackAnalyser.connect(this.ctx.destination)
          playbackAnalyser.__connectedToDestination = true
        }
        for (const el of Array.from(document.querySelectorAll('audio'))) {
          el.muted = false
          el.volume = 1
          await el.play().catch(() => {})
          if (!this.playbackStreamSources.has(el) && typeof el.captureStream === 'function') {
            const stream = el.captureStream()
            if (stream.getAudioTracks().length > 0) {
              const source = this.ctx.createMediaStreamSource(stream)
              source.connect(playbackAnalyser)
              this.playbackStreamSources.set(el, source)
            }
          }
          if (!this.sources.has(el) && !this.playbackStreamSources.has(el)) {
            const source = this.ctx.createMediaElementSource(el)
            source.connect(playbackAnalyser)
            this.sources.set(el, source)
          }
        }
        const lkRoom = w.__lkRoom
        const remoteTracks = []
        if (lkRoom?.remoteParticipants) {
          for (const participant of lkRoom.remoteParticipants.values()) {
            const pubs = participant.trackPublications?.values?.() ?? []
            for (const pub of pubs) {
              const mst = pub.track?.mediaStreamTrack
              if (mst?.kind === 'audio' && mst.readyState === 'live') remoteTracks.push(mst)
            }
          }
        }
        for (const track of remoteTracks) {
          if (!this.streamSources.has(track)) {
            const stream = new MediaStream([track])
            const source = this.ctx.createMediaStreamSource(stream)
            source.connect(rawAnalyser)
            this.streamSources.set(track, source)
          }
        }
        return { elements: document.querySelectorAll('audio').length, tracks: remoteTracks.length }
      },
      measure(analyser, data) {
        if (!analyser || !data) return 0
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) {
          const x = (v - 128) / 128
          sum += x * x
        }
        return Math.sqrt(sum / data.length)
      },
      levels() {
        const playbackLevel = this.measure(this.playbackAnalyser, this.playbackData)
        const rawTrackLevel = this.measure(this.rawAnalyser, this.rawData)
        const combinedLevel = Math.max(playbackLevel, rawTrackLevel)
        const selectedLevel = window.__muteProbeMode === 'raw'
          ? rawTrackLevel
          : window.__muteProbeMode === 'combined'
            ? combinedLevel
            : playbackLevel
        if (selectedLevel > audibleLevel) {
          this.lastAudibleAt = performance.now()
          this.lastAudibleWallAt = Date.now()
        }
        return { playbackLevel, rawTrackLevel, combinedLevel }
      },
    }
  }, { audibleLevel: AUDIBLE_LEVEL })
}

async function audioLevel(page) {
  return page.evaluate(async () => {
    const probe = window.__muteProbe
    if (!probe) return { elements: 0, tracks: 0, level: 0, playbackLevel: 0, rawTrackLevel: 0, combinedLevel: 0 }
    const counts = await probe.init()
    const levels = probe.levels()
    const level = window.__muteProbeMode === 'raw'
      ? levels.rawTrackLevel
      : window.__muteProbeMode === 'combined'
        ? levels.combinedLevel
        : levels.playbackLevel
    return { ...counts, ...levels, level }
  })
}

async function waitForAudible(page, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let last = { elements: 0, tracks: 0, level: 0 }
  let consecutive = 0
  while (Date.now() < deadline) {
    last = await audioLevel(page)
    if ((last.elements > 0 || last.tracks > 0) && last.level > AUDIBLE_LEVEL) {
      consecutive += 1
      if (consecutive >= 10) return last
    } else {
      consecutive = 0
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Receiver never became audible. Last probe: ${JSON.stringify(last)}`)
}

async function waitForSilence(page, startMs, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  const neededSilentSamples = Math.max(1, Math.ceil(SILENT_STABLE_MS / 100))
  let consecutiveSilentSamples = 0
  let lastAudibleDeltaMs = 0
  let last = { elements: 0, tracks: 0, level: 0, playbackLevel: 0, rawTrackLevel: 0, combinedLevel: 0 }
  const samples = []
  while (Date.now() < deadline) {
    last = await audioLevel(page)
    samples.push({
      t: Date.now() - startMs,
      playback: Number(last.playbackLevel.toFixed(4)),
      raw: Number(last.rawTrackLevel.toFixed(4)),
      selected: Number(last.level.toFixed(4)),
    })
    if ((last.elements > 0 || last.tracks > 0) && last.level < SILENT_LEVEL) {
      consecutiveSilentSamples += 1
      if (consecutiveSilentSamples >= neededSilentSamples) {
        const probe = await page.evaluate(() => {
          const p = window.__muteProbe
          return p ? { lastAudibleWallAt: p.lastAudibleWallAt } : null
        })
        if (probe?.lastAudibleWallAt) {
          lastAudibleDeltaMs = Math.max(0, probe.lastAudibleWallAt - startMs)
        }
        return {
          latencyMs: Date.now() - startMs,
          lastAudibleMs: lastAudibleDeltaMs,
          last,
          samples,
        }
      }
    } else {
      consecutiveSilentSamples = 0
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  const tail = samples.slice(-25)
  throw new Error(`Receiver did not become silent within ${timeoutMs}ms. Last probe: ${JSON.stringify(last)}. Tail samples: ${JSON.stringify(tail)}`)
}

async function observeAudioAfterMuted(page, startMs, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let firstAudibleMs = null
  let lastAudibleMs = null
  let maxSelected = 0
  const samples = []
  while (Date.now() < deadline) {
    const level = await audioLevel(page)
    const t = Date.now() - startMs
    maxSelected = Math.max(maxSelected, level.level)
    samples.push({
      t,
      playback: Number(level.playbackLevel.toFixed(4)),
      raw: Number(level.rawTrackLevel.toFixed(4)),
      selected: Number(level.level.toFixed(4)),
    })
    if ((level.elements > 0 || level.tracks > 0) && level.level > AUDIBLE_LEVEL) {
      if (firstAudibleMs === null) firstAudibleMs = t
      lastAudibleMs = t
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return { firstAudibleMs, lastAudibleMs, maxSelected, samples }
}

async function waitForDesktopMicPublished(page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const w = window
      const track = w.__lkMicTrack
      if (track) return { enabled: track.enabled, readyState: track.readyState, source: 'window.__lkMicTrack' }

      const lkRoom = w.__lkRoom
      const pubs = lkRoom?.localParticipant?.trackPublications?.values?.() ?? []
      for (const pub of pubs) {
        const mst = pub.track?.mediaStreamTrack
        if (mst?.kind === 'audio') {
          return { enabled: mst.enabled, readyState: mst.readyState, source: 'localParticipant.trackPublications' }
        }
      }
      return null
    })
    if (state?.readyState === 'live') return state
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Desktop mic was not published before timeout')
}

async function maybeDesktopMicPublished(page, timeoutMs = 5_000) {
  try {
    return await waitForDesktopMicPublished(page, timeoutMs)
  } catch {
    return null
  }
}

async function ensureDesktopAuthenticated(page, token, user, channelId) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: TOKEN_KEY, value: token })
  if (USE_PACKAGED_DESKTOP) {
    await page.evaluate((id) => { window.location.hash = `/channels/${id}` }, channelId)
    await page.reload()
  } else {
    await page.goto(`${DESKTOP_URL}/channels/${channelId}`)
  }

  const username = page.locator('input#username')
  if (await username.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await username.fill(user.username)
    await page.locator('input#password').fill(user.password)
    await page.locator('button[type="submit"], button:has-text("Log In")').click()
    await page.waitForFunction(() => !location.hash.includes('/login') && !location.pathname.includes('/login'), null, { timeout: 15_000 }).catch(() => {})
    if (USE_PACKAGED_DESKTOP) {
      await page.evaluate((id) => { window.location.hash = `/channels/${id}` }, channelId)
      await page.reload()
    } else {
      await page.goto(`${DESKTOP_URL}/channels/${channelId}`)
    }
  }

  await page.locator('button:has-text("Join Voice"), .voice-btn-toggle:has-text("Join Voice")').waitFor({ timeout: 20_000 })
}

async function waitForElectronAppWindow(electronApp, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (page.url().startsWith(DESKTOP_URL)) return page
    }
    const page = await Promise.race([
      electronApp.waitForEvent('window', { timeout: 1_000 }).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 1_000)),
    ])
    if (page && page.url().startsWith(DESKTOP_URL)) return page
  }
  throw new Error(`Timed out waiting for Electron app window at ${DESKTOP_URL}`)
}

async function main() {
  if (!ADMIN_TOKEN) throw new Error('ADMIN_API_TOKEN or .admin_token is required')
  const audioPath = AUDIO_SOURCE === 'fake-file' ? ensureFakeAudioFile(fakeAudioPath) : fakeAudioPath
  log('desktop audio source:', AUDIO_SOURCE)
  if (AUDIO_SOURCE === 'fake-file') log('fake microphone WAV:', audioPath)

  if (!USE_PACKAGED_DESKTOP) {
    spawnServer('desktop-vite', path.join(root, 'apps/desktop-win'), ['exec', 'vite', '--config', 'vite.renderer.config.ts', '--host', '127.0.0.1', '--port', '5173'])
  }
  if (START_WEB) {
    spawnServer('web-vite', path.join(root, 'apps/web-client'), ['dev'])
  }
  await Promise.all([USE_PACKAGED_DESKTOP ? Promise.resolve() : waitForUrl(DESKTOP_URL), waitForUrl(WEB_URL)])

  const { roomId, channelId } = await createRoomAndChannel()
  let browser
  let electronApp
  try {
    const [senderToken, receiverToken] = await Promise.all([
      registerAndLogin(sender),
      registerAndLogin(receiver),
    ])

    browser = await chromium.launch({
      headless: WEB_HEADLESS,
      args: ['--autoplay-policy=no-user-gesture-required'],
    })
    const webCtx = await browser.newContext({ permissions: ['microphone'] })
    await webCtx.addInitScript(({ key, token }) => localStorage.setItem(key, token), { key: TOKEN_KEY, token: receiverToken })
    const webPage = await webCtx.newPage()

    electronApp = await electron.launch({
      executablePath: USE_PACKAGED_DESKTOP ? DESKTOP_EXE : electronPath,
      args: USE_PACKAGED_DESKTOP
        ? mediaFlags(audioPath)
        : [
            ...mediaFlags(audioPath),
            path.join(root, 'apps/desktop-win/out/main/index.js'),
          ],
      env: {
        ...electronEnv,
        OPENSPACE_API_URL: API_URL,
        OPENSPACE_WS_URL: 'ws://localhost:3001',
      },
    })
    const desktopPage = USE_PACKAGED_DESKTOP
      ? await electronApp.firstWindow()
      : await waitForElectronAppWindow(electronApp)
    desktopPage.on('console', (msg) => log(`desktop console ${msg.type()}: ${msg.text()}`))
    webPage.on('console', (msg) => log(`web console ${msg.type()}: ${msg.text()}`))
    if (AUDIO_SOURCE === 'oscillator') {
      await installDesktopOscillatorMic(desktopPage)
    }
    await ensureDesktopAuthenticated(desktopPage, senderToken, sender, channelId)
    await webPage.goto(`${WEB_URL}/channels/${channelId}`)

    log('desktop url:', desktopPage.url())
    log('desktop text:', (await desktopPage.locator('body').innerText({ timeout: 5_000 }).catch((e) => `ERR ${e.message}`)).slice(0, 300).replace(/\s+/g, ' '))
    log('web url:', webPage.url())
    log('web text:', (await webPage.locator('body').innerText({ timeout: 5_000 }).catch((e) => `ERR ${e.message}`)).slice(0, 300).replace(/\s+/g, ' '))

    await webPage.locator('button:has-text("Join Voice"), .voice-btn-toggle:has-text("Join Voice")').click()
    await webPage.locator('button:has-text("Mute"), .voice-btn-toggle:has-text("Mute")').waitFor({ timeout: 20_000 })
    if (RECEIVER_MUTE) {
      await webPage.locator('button:has-text("Mute"), .voice-btn-toggle:has-text("Mute")').click()
      await webPage.locator('button:has-text("Unmute"), .voice-btn-toggle:has-text("Unmute")').waitFor({ timeout: 2_000 })
    }
    await installAudioProbe(webPage)
    await webPage.evaluate((mode) => { window.__muteProbeMode = mode }, PROBE_MODE)

    await desktopPage.locator('button:has-text("Join Voice"), .voice-btn-toggle:has-text("Join Voice")').click()
    const desktopMuteButton = desktopPage.locator('button:has-text("Mute"), .voice-btn-toggle:has-text("Mute")')
    await desktopMuteButton.waitFor({ timeout: 20_000 })

    if (TEST_MODE === 'early-mute') {
      const t0 = Date.now()
      await desktopMuteButton.click()
      await desktopPage.locator('button:has-text("Unmute"), .voice-btn-toggle:has-text("Unmute")').waitFor({ timeout: 2_000 })
      const observed = await observeAudioAfterMuted(webPage, t0, SILENCE_TIMEOUT_MS)
      if (observed.firstAudibleMs !== null) {
        log('MUTE_LATENCY_RESULT=audio_leaked_after_muted_ui')
        log(`MUTE_FIRST_AUDIBLE_AFTER_MUTED_MS=${observed.firstAudibleMs}`)
        log(`MUTE_LAST_AUDIBLE_AFTER_MUTED_MS=${observed.lastAudibleMs}`)
        log(`MUTE_MAX_SELECTED_LEVEL=${observed.maxSelected.toFixed(4)}`)
        log(`post-muted samples: ${JSON.stringify(observed.samples.slice(0, 80))}`)
        throw new Error('Audio was audible after desktop UI switched to muted')
      }
      log('MUTE_LATENCY_RESULT=no_audio_after_muted_ui')
      log(`MUTE_MAX_SELECTED_LEVEL=${observed.maxSelected.toFixed(4)}`)
      log(`post-muted samples: ${JSON.stringify(observed.samples.slice(0, 80))}`)
      return
    }

    const senderMic = await maybeDesktopMicPublished(desktopPage)
    log('desktop mic state:', JSON.stringify(senderMic))

    if (AUDIO_SOURCE === 'real' && PLAY_SYSTEM_TONE) {
      log('playing system tone for real microphone capture')
      spawnSystemTone(Math.ceil((SILENCE_TIMEOUT_MS + 20_000) / 1000))
    }

    const audible = await waitForAudible(webPage, 45_000)
    log(`probe mode: ${PROBE_MODE}`)
    log(`baseline receiver audio level: selected=${audible.level.toFixed(4)} playback=${audible.playbackLevel.toFixed(4)} raw=${audible.rawTrackLevel.toFixed(4)} (${audible.elements} audio element(s), ${audible.tracks} remote track(s))`)

    const t0 = Date.now()
    const receiverMutedIconPromise = !RECEIVER_MUTE
      ? webPage.locator('[title="Muted"]').first().waitFor({ timeout: 10_000 })
        .then(() => Date.now() - t0)
        .catch(() => null)
      : Promise.resolve(null)
    await desktopPage.locator('button:has-text("Mute"), .voice-btn-toggle:has-text("Mute")').click()
    try {
      const result = await waitForSilence(webPage, t0, SILENCE_TIMEOUT_MS)
      const receiverMutedIconMs = await receiverMutedIconPromise
      log(`MUTE_LATENCY_RESULT=silenced`)
      log(`MUTE_LATENCY_MS=${result.latencyMs}`)
      log(`MUTE_LATENCY_SECONDS=${(result.latencyMs / 1000).toFixed(3)}`)
      log(`MUTE_LAST_AUDIBLE_MS=${result.lastAudibleMs}`)
      log(`MUTE_LAST_AUDIBLE_SECONDS=${(result.lastAudibleMs / 1000).toFixed(3)}`)
      if (receiverMutedIconMs !== null) log(`RECEIVER_MUTED_ICON_MS=${receiverMutedIconMs}`)
      log(`post-mute samples: ${JSON.stringify(result.samples.slice(0, 20))}`)
    } catch (err) {
      const last = await audioLevel(webPage).catch(() => null)
      log(`MUTE_LATENCY_RESULT=not_silenced`)
      log(`MUTE_LATENCY_MS=>=${SILENCE_TIMEOUT_MS}`)
      log(`MUTE_LATENCY_SECONDS=>=${(SILENCE_TIMEOUT_MS / 1000).toFixed(3)}`)
      log(`last receiver audio probe: ${JSON.stringify(last)}`)
      throw err
    }
  } finally {
    await electronApp?.close().catch(() => {})
    await browser?.close().catch(() => {})
    await deleteRoom(roomId).catch(() => {})
    for (const child of children) killChildTree(child)
  }
}

main().catch((err) => {
  console.error('[mute-latency] FAILED:', err)
  for (const child of children) killChildTree(child)
  process.exit(1)
})
