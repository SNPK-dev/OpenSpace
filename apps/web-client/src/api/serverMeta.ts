export interface ServerMetadata {
  server_id: string
  name: string
  description: string
  public_url: string
  avatar_url: string
  registration_policy: 'open' | 'invite_code_only' | 'approval_required' | 'closed'
  features: { text: boolean; voice: boolean; files: boolean; device_pairing: boolean }
  tls_required: boolean
}

export async function fetchServerMetadata(baseUrl: string, options: { signal?: AbortSignal } = {}): Promise<ServerMetadata> {
  const url = normalizeBaseUrl(baseUrl)
  const res = await fetch(`${url}/.well-known/openspace/server`, {
    headers: { Accept: 'application/json' },
    ...(options.signal ? { signal: options.signal } : {}),
  })
  if (!res.ok) throw new Error(`Server metadata fetch failed: ${res.status}`)
  return res.json() as Promise<ServerMetadata>
}

export function normalizeBaseUrl(raw: string): string {
  const input = raw.trim()
  const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Enter only a server address, without a path, query, or credentials.')
  }
  return parsed.origin
}

export function serverAddressWarning(raw: string): string | null {
  try {
    const url = new URL(normalizeBaseUrl(raw))
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return 'Insecure HTTP connection. Messages and sign-in data may be exposed. Use a trusted HTTPS address.'
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith('[')) {
      return 'Direct IP connection. Verify the server owner and its TLS certificate before connecting; an IP address alone does not make the connection private.'
    }
    return null
  } catch { return null }
}
