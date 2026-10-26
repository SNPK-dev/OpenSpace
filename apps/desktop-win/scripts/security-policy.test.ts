import assert from 'node:assert/strict'
import test from 'node:test'
import { developmentCSP, isTrustedRendererURL, productionCSP, safeExternalURL } from '../src/main/security.ts'

test('production CSP blocks executable remote content', () => {
  assert.match(productionCSP, /script-src 'self'/)
  assert.doesNotMatch(productionCSP, /unsafe-eval|script-src[^;]*https:/)
  for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(productionCSP.includes(directive))
  assert.match(developmentCSP, /http:\/\/localhost:5173/)
  assert.doesNotMatch(productionCSP, /localhost/)
})

test('renderer trust is exact in development and packaged modes', () => {
  const entry = 'file:///C:/OpenSpace/renderer/index.html'
  assert.equal(isTrustedRendererURL('http://localhost:5173/', true, entry), true)
  assert.equal(isTrustedRendererURL('http://localhost:5173.evil.test/', true, entry), false)
  assert.equal(isTrustedRendererURL(entry + '#/rooms', false, entry), true)
  assert.equal(isTrustedRendererURL('file:///C:/OpenSpace/renderer/evil.html', false, entry), false)
  assert.equal(isTrustedRendererURL('https://chat.example.com', false, entry), false)
  assert.equal(isTrustedRendererURL(null, false, entry), false)
  assert.equal(isTrustedRendererURL(undefined, false, entry), false)
})

test('external launch permits only HTTP(S)', () => {
  assert.equal(safeExternalURL('https://example.com/path'), 'https://example.com/path')
  assert.equal(safeExternalURL('http://example.com/'), 'http://example.com/')
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'openspace://pair', 'not a url']) assert.equal(safeExternalURL(value), null)
})
