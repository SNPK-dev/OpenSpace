export interface RegistrationChallengeResponse {
  challenge_id: string
  server_id: string
  nonce: string
  expires_at: string
}

export interface RegistrationCompleteResponse {
  server_identity_id: string
  device_id: string
  identity_status: 'active' | 'pending'
  access_token: string | null
}

export async function deviceRegChallenge(
  baseUrl: string,
  devicePublicKey: string,
  displayName: string,
  inviteCode: string | null,
  clientType: 'web' | 'windows' | 'mobile',
): Promise<RegistrationChallengeResponse> {
  const res = await fetch(`${baseUrl}/api/auth/device-registration/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_public_key: devicePublicKey, display_name: displayName, invite_code: inviteCode, client_type: clientType }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'challenge_failed')
  }
  return res.json() as Promise<RegistrationChallengeResponse>
}

export async function deviceRegComplete(
  baseUrl: string,
  challengeId: string,
  signature: string,
): Promise<RegistrationCompleteResponse> {
  const res = await fetch(`${baseUrl}/api/auth/device-registration/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, signature }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }))
    throw new Error(err.error ?? 'complete_failed')
  }
  return res.json() as Promise<RegistrationCompleteResponse>
}
