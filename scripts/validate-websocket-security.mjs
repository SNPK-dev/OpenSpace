import fs from 'node:fs'

const files = [
  'apps/web-client/src/context/WSContext.tsx',
  'apps/desktop-win/src/renderer/src/context/WSContext.tsx',
  'apps/mobile/src/context/WSContext.tsx',
]

const failures = []
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes('api.realtime.ticket()')) failures.push(`${file}: does not request a fresh realtime ticket`)
  if (!source.includes("['openspace.v1', `ticket.${ticket}`]")) failures.push(`${file}: ticket subprotocol is missing`)
  if (/\/ws\?(?:token|ticket)=/.test(source)) failures.push(`${file}: credential remains in WebSocket URL`)
}

const gateway = fs.readFileSync('apps/realtime-gateway/internal/gateway/handler.go', 'utf8')
if (gateway.includes('Query().Get("token")')) failures.push('gateway: legacy token URL authentication remains')
if (!gateway.includes('GetDel(')) failures.push('gateway: ticket consumption is not atomic')

if (failures.length) {
  console.error(`WebSocket security validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`WebSocket security validation passed (${files.length} clients, single-use gateway ticket).`)
