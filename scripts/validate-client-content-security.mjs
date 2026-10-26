import { readFileSync } from 'node:fs'

const caddy = readFileSync('infra/caddy/Caddyfile.prod', 'utf8')
const web = readFileSync('apps/web-client/nginx.conf', 'utf8')
const admin = readFileSync('apps/admin-web/nginx.conf', 'utf8')
const electron = readFileSync('apps/desktop-win/src/main/index.ts', 'utf8')
const policy = readFileSync('apps/desktop-win/src/main/security.ts', 'utf8')
const html = readFileSync('apps/desktop-win/src/renderer/index.html', 'utf8')
const failures = []

for (const [name, source] of [['caddy', caddy], ['web nginx', web], ['admin nginx', admin]]) {
  for (const directive of ["script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
    if (!source.includes(directive)) failures.push(`${name}: missing ${directive}`)
  }
  if (/script-src[^;\"]*unsafe-eval/.test(source)) failures.push(`${name}: production unsafe-eval present`)
}
const productionPolicy = policy.split('export const developmentCSP')[0]
if (productionPolicy.includes('unsafe-eval') || productionPolicy.includes('localhost')) failures.push('Electron: development sources leaked into production policy')
for (const required of ['sandbox: true', 'contextIsolation: true', 'nodeIntegration: false', 'webSecurity: true', 'allowRunningInsecureContent: false', 'devTools: isDev', 'setWindowOpenHandler', "on('will-navigate'", 'setPermissionRequestHandler']) {
  if (!electron.includes(required)) failures.push(`Electron: missing ${required}`)
}
if (!/isTrusted\(event\.senderFrame\?\.url\)/.test(electron)) failures.push('Electron: IPC sender frame URL is not checked fail-closed')
if (html.includes('unsafe-eval') || html.includes('https://*')) failures.push('Electron HTML: permissive legacy CSP remains')

if (failures.length) {
  console.error(`Client content security validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Client content security validation passed (Caddy, web, admin, Electron).')
