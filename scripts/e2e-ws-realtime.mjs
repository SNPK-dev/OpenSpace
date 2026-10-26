#!/usr/bin/env node
/**
 * E2E: Real-time WebSocket message delivery
 *
 * Confirms that a message sent by client A via the REST API
 * is immediately pushed to client B over WebSocket — without a page reload.
 *
 * Usage (against production):
 *   node scripts/e2e-ws-realtime.mjs
 *
 * Env vars:
 *   WS_URL      WebSocket base, default ws://localhost:3001
 *   API_URL     REST base,      default http://localhost:8080
 *   API_TOKEN   authenticated session used to provision one-time WS tickets
 */

const WebSocket = globalThis.WebSocket
if (typeof WebSocket !== 'function') throw new Error('Node.js 22 or newer with built-in WebSocket support is required')

const WS_URL     = (process.env.WS_URL  ?? 'ws://localhost:3001').replace(/\/$/, '')
const API_URL    = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const API_TOKEN  = process.env.API_TOKEN ?? ''
const TIMEOUT_MS = 5000

if (!API_TOKEN) throw new Error('API_TOKEN is required')

let passed = 0; let failed = 0

function assert(cond, msg) { if (!cond) throw new Error(msg) }

function connectWS(ticket, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws`, ['openspace.v1', `ticket.${ticket}`])
    const received = []
    ws.addEventListener('open', () => resolve({ ws, received }), { once: true })
    ws.addEventListener('message', async (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : await event.data.text()
        received.push(JSON.parse(text))
      } catch { /* ignore */ }
    })
    ws.addEventListener('error', () => reject(new Error(`${label} WS connection failed`)), { once: true })
    setTimeout(() => reject(new Error(`${label} WS connect timeout`)), 5000)
  })
}

async function api(method, path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await response.json() } catch { /* no response body */ }
  return { response, json }
}

async function issueTicket() {
  const { response, json } = await api('POST', '/api/v1/realtime/ticket')
  assert(response.status === 201 || response.status === 200, `ticket request expected 200/201, got ${response.status}`)
  assert(typeof json?.ticket === 'string', 'ticket response missing ticket')
  return json.ticket
}

function waitForEvent(received, predicate, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = setInterval(() => {
      const found = received.find(predicate)
      if (found) { clearInterval(check); resolve(found) }
      if (Date.now() > deadline) {
        clearInterval(check)
        reject(new Error(`event not received within ${timeoutMs}ms`))
      }
    }, 50)
  })
}

async function step(n, desc, fn) {
  try {
    await fn()
    console.log(`  [PASS] Step ${n}: ${desc}`)
    passed++
  } catch (err) {
    console.log(`  [FAIL] Step ${n}: ${desc}`)
    console.log(`         ${err.message}`)
    failed++
  }
}

console.log('SCENARIO: WebSocket real-time message delivery')
console.log(`  WS:  ${WS_URL}`)
console.log(`  API: ${API_URL}\n`)

let clientA = null; let clientB = null
const room = await api('POST', '/api/v1/rooms', { name: `WS E2E ${Date.now()}` })
assert(room.response.status === 201, `room create expected 201, got ${room.response.status}`)
const ROOM_ID = room.json.id
const channel = await api('POST', `/api/v1/rooms/${ROOM_ID}/channels`, { name: 'realtime', type: 'text' })
assert(channel.response.status === 201, `channel create expected 201, got ${channel.response.status}`)
const CHANNEL_ID = channel.json.id

// Step 1: Connect sender (admin) to WS
await step(1, 'Client A (admin) connects to WebSocket', async () => {
  clientA = await connectWS(await issueTicket(), 'ClientA')
})

// Step 2: Connect receiver (windows device) to WS
await step(2, 'Client B (windows) connects to WebSocket', async () => {
  clientB = await connectWS(await issueTicket(), 'ClientB')
})

// Step 3: Send message from client A via REST API
const testContent = `ws-e2e-${Date.now()}`
await step(3, `Client A sends message "${testContent}" via REST API`, async () => {
  const res = await fetch(`${API_URL}/api/v1/rooms/${ROOM_ID}/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ content: testContent }),
  })
  assert(res.status === 201, `expected 201, got ${res.status}`)
})

// Step 4: Client B must receive the message via WS without reload
await step(4, `Client B receives the message via WS within ${TIMEOUT_MS}ms`, async () => {
  const event = await waitForEvent(
    clientB.received,
    (e) => e.type === 'message.created' && e.message?.content === testContent,
    TIMEOUT_MS,
  )
  assert(event, 'message.created event not found')
})

// Step 5: Client A must also receive its own message echoed back (confirming pub/sub loop)
await step(5, 'Client A also receives the WS echo', async () => {
  const event = await waitForEvent(
    clientA.received,
    (e) => e.type === 'message.created' && e.message?.content === testContent,
    TIMEOUT_MS,
  )
  assert(event, 'message.created WS echo not found on sender side')
})

// Step 6: Simulate a dropped receiver connection and reconnect with a fresh,
// one-time ticket (reusing a consumed ticket must never be required).
await step(6, 'Client B reconnects with a fresh one-time ticket', async () => {
  clientB.ws.close()
  clientB = await connectWS(await issueTicket(), 'ClientB reconnect')
})

// Step 7: Prove delivery continues after reconnect.
const reconnectContent = `ws-reconnect-e2e-${Date.now()}`
await step(7, 'Client B receives a message after reconnect', async () => {
  const { response } = await api('POST', `/api/v1/rooms/${ROOM_ID}/channels/${CHANNEL_ID}/messages`, { content: reconnectContent })
  assert(response.status === 201, `expected 201, got ${response.status}`)
  const event = await waitForEvent(
    clientB.received,
    (e) => e.type === 'message.created' && e.message?.content === reconnectContent,
    TIMEOUT_MS,
  )
  assert(event, 'post-reconnect message.created event not found')
})

clientA?.ws.close()
clientB?.ws.close()
const cleanup = await api('DELETE', `/api/v1/rooms/${ROOM_ID}`)
assert(cleanup.response.status === 204, `room cleanup expected 204, got ${cleanup.response.status}`)

console.log('')
const total = passed + failed
if (failed === 0) console.log(`${total}/${total} steps passed ✓`)
else { console.log(`${passed}/${total} steps passed, ${failed} failed`); process.exit(1) }
