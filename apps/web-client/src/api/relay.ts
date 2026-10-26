export interface UploadBundleResponse {
  transfer_id: string
}

export interface DownloadBundleResponse {
  encrypted_bundle: string
}

export async function uploadBundle(
  relayUrl: string,
  encryptedBundle: string,
  expiresInSeconds = 1800,
): Promise<UploadBundleResponse> {
  const res = await fetch(`${relayUrl}/api/relay/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_bundle: encryptedBundle, expires_in_seconds: expiresInSeconds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'upload_failed')
  }
  return res.json() as Promise<UploadBundleResponse>
}

export async function downloadBundle(
  relayUrl: string,
  transferId: string,
): Promise<DownloadBundleResponse> {
  const res = await fetch(`${relayUrl}/api/relay/transfers/${transferId}`, {
    method: 'GET',
    headers: { 'Referrer-Policy': 'no-referrer' },
    referrerPolicy: 'no-referrer',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'transfer_not_found' }))
    throw new Error(err.error ?? 'download_failed')
  }
  return res.json() as Promise<DownloadBundleResponse>
}
