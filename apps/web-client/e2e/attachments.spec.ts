import { test, expect } from '@playwright/test'
import { request as httpRequest } from 'node:http'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

async function putToSignedURL(rawURL: string, body: string, contentType: string): Promise<{
  ok: boolean
  status: number
  text: string
}> {
  const signedURL = new URL(rawURL)
  if (signedURL.hostname !== 'minio') {
    const res = await fetch(rawURL, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    })
    return { ok: res.ok, status: res.status, text: await res.text() }
  }

  const payload = Buffer.from(body)
  return await new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: 'localhost',
      port: signedURL.port || '9000',
      method: 'PUT',
      path: `${signedURL.pathname}${signedURL.search}`,
      headers: {
        Host: signedURL.host,
        'Content-Type': contentType,
        'Content-Length': payload.byteLength,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve({
        ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
        status: res.statusCode ?? 0,
        text: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

test.describe('File Attachments (MinIO upload flow)', () => {
  test('full upload flow via API: presign → PUT → confirm returns URL', async ({ request }) => {
    // Step 1: Request presigned URL
    const urlRes = await request.post(`${API_URL}/api/v1/attachments/upload-url`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      data: { filename: 'pw-test.txt', content_type: 'text/plain', size_bytes: 18 },
    })
    expect(urlRes.ok()).toBeTruthy()
    const { attachment_id, upload_url } = await urlRes.json() as {
      attachment_id: string
      upload_url: string
    }
    expect(typeof attachment_id).toBe('string')
    expect(typeof upload_url).toBe('string')

    // Step 2: PUT actual bytes to MinIO presigned URL
    const putRes = await putToSignedURL(upload_url, 'playwright test file', 'text/plain')
    expect(putRes.ok, `PUT failed: ${putRes.status} ${putRes.text}`).toBeTruthy()

    // Step 3: Confirm upload
    const confirmRes = await request.post(`${API_URL}/api/v1/attachments/${attachment_id}/confirm`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    expect(confirmRes.ok()).toBeTruthy()
    const confirmed = await confirmRes.json() as {
      id: string
      filename: string
      url: string
    }
    expect(confirmed.filename).toBe('pw-test.txt')
    expect(typeof confirmed.url).toBe('string')
    expect(confirmed.url.length).toBeGreaterThan(0)
  })

  test('confirm before upload returns 422 or 404', async ({ request }) => {
    const confirmRes = await request.post(`${API_URL}/api/v1/attachments/nonexistent-id/confirm`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    expect([404, 422]).toContain(confirmRes.status())
  })
})
