export const productionCSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

export const developmentCSP = productionCSP
  .replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
  .replace("connect-src 'self' https: wss:", "connect-src 'self' https: wss: http://localhost:5173 http://localhost:8080 ws://localhost:5173 ws://localhost:3001")

export function isTrustedRendererURL(rawURL: string | null | undefined, isDev: boolean, productionEntryURL: string): boolean {
  if (!rawURL) return false
  try {
    const candidate = new URL(rawURL)
    if (isDev) return candidate.origin === 'http://localhost:5173'
    const expected = new URL(productionEntryURL)
    return candidate.protocol === 'file:' && candidate.pathname.toLowerCase() === expected.pathname.toLowerCase()
  } catch {
    return false
  }
}

export function safeExternalURL(rawURL: string): string | null {
  try {
    const parsed = new URL(rawURL)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}
