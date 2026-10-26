export interface PairingTokenResponse {
  pairing_token: string
  expires_at: string
}

export interface RedeemChallengeResponse {
  challenge_id: string
  server_id: string
  nonce: string
  expires_at: string
}

export interface RedeemCompleteResponse {
  server_identity_id: string
  device_id: string
  access_token: string
}

export async function createPairingToken(
  baseUrl: string,
  accessToken: string,
  ttlSeconds = 1800,
): Promise<PairingTokenResponse> {
  const res = await fetch(`${baseUrl}/api/devices/pairing-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'pairing_token_failed')
  }
  return res.json() as Promise<PairingTokenResponse>
}

export async function redeemChallenge(
  baseUrl: string,
  pairingToken: string,
  newDevicePublicKey: string,
  clientType: 'web' | 'windows' | 'mobile' = 'web',
): Promise<RedeemChallengeResponse> {
  const res = await fetch(`${baseUrl}/api/devices/redeem/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairing_token: pairingToken, new_device_public_key: newDevicePublicKey, client_type: clientType }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'redeem_challenge_failed')
  }
  return res.json() as Promise<RedeemChallengeResponse>
}

export async function redeemComplete(
  baseUrl: string,
  challengeId: string,
  signature: string,
): Promise<RedeemCompleteResponse> {
  const res = await fetch(`${baseUrl}/api/devices/redeem/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, signature }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'redeem_complete_failed')
  }
  return res.json() as Promise<RedeemCompleteResponse>
}
