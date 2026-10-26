import React, { useState, useEffect, FormEvent } from 'react'
import { useVault, type ServerEntry } from '../context/VaultContext'
import { downloadBundle } from '../api/relay'
import { decryptBundle, deserializeBundle, type TransferBundleServer } from '../crypto/bundle'
import { redeemChallenge, redeemComplete } from '../api/devicePairing'
import { createFreshKeypair, storeKeypairForServer, exportPublicKeySpki, signChallenge } from '../crypto/keypair'

type PairStatus = 'success' | 'failed' | 'skipped'

interface PairResult {
  server_id: string
  url: string
  display_name: string
  status: PairStatus
  error?: string
  device_id?: string
  access_token?: string
  avatar_url?: string | undefined
}

export default function PairDevicePage() {
  const { addServer } = useVault()
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PairResult[] | null>(null)

  // Auto-fill from URL if the page was opened with a full transfer link
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('key=')) {
      const full = window.location.href
      setLink(full)
      // Remove fragment immediately to protect the key
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  async function handleImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await importTransferLink(link.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  async function importTransferLink(rawLink: string) {
    // Parse the link
    let parsedUrl: URL
    try {
      // Support both openspace:// and https:// transfer links
      const normalized = rawLink.replace(/^openspace:\/\/pair/, 'https://pair.openspace')
      parsedUrl = new URL(normalized)
    } catch {
      throw new Error('Invalid link format')
    }

    const relayUrl = parsedUrl.searchParams.get('relay')
    const transferId = parsedUrl.searchParams.get('transfer_id')
    const fragment = parsedUrl.hash.replace('#', '')
    const keyParam = new URLSearchParams(fragment).get('key')

    if (!relayUrl || !transferId || !keyParam) {
      throw new Error('The link is missing required parameters (relay, transfer_id, key)')
    }

    // Download encrypted bundle from relay
    const { encrypted_bundle: rawBundle } = await downloadBundle(relayUrl, transferId)
    const encryptedBundle = deserializeBundle(rawBundle)

    // Decrypt locally
    const bundle = await decryptBundle(encryptedBundle, keyParam)

    if (!bundle.servers || bundle.servers.length === 0) {
      throw new Error('The bundle contains no servers')
    }

    // Redeem on each server
    const pairResults: PairResult[] = []
    for (const server of bundle.servers) {
      const result = await redeemOnServer(server)
      pairResults.push(result)
    }

    // Save successfully paired servers to vault
    for (const result of pairResults) {
      if (result.status === 'success' && result.device_id && result.access_token) {
        const entry: ServerEntry = {
          server_id: result.server_id,
          name: result.display_name,
          url: result.url,
          ...(result.avatar_url ? { avatar_url: result.avatar_url } : {}),
          connection_state: 'joined',
          device_id: result.device_id,
          access_token: result.access_token,
          added_at: new Date().toISOString(),
        }
        await addServer(entry)
      }
    }

    setResults(pairResults)
  }

  async function redeemOnServer(server: TransferBundleServer): Promise<PairResult> {
    try {
      const keypair = await createFreshKeypair()
      const publicKeyB64 = await exportPublicKeySpki(keypair.publicKey)

      const challenge = await redeemChallenge(server.server_url, server.pairing_token, publicKeyB64)
      const sig = await signChallenge(keypair.privateKey, {
        op: 'device_pairing_redeem',
        server_id: challenge.server_id,
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        device_public_key: publicKeyB64,
        client_type: 'web',
        expires_at: challenge.expires_at,
      })
      const complete = await redeemComplete(server.server_url, challenge.challenge_id, sig)

      await storeKeypairForServer(server.server_id, keypair)

      return {
        server_id: server.server_id,
        url: server.server_url,
        display_name: server.display_name,
        avatar_url: server.avatar_url,
        status: 'success',
        device_id: complete.device_id,
        access_token: complete.access_token,
      }
    } catch (err) {
      return {
        server_id: server.server_id,
        url: server.server_url,
        display_name: server.display_name,
        avatar_url: server.avatar_url,
        status: 'failed',
        error: err instanceof Error ? err.message : 'unknown',
      }
    }
  }

  if (results) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Access transfer result</h1>
          <div className="pair-results">
            {results.map(r => (
              <div key={r.server_id} className={`pair-result pair-result--${r.status}`}>
                <div className="pair-result-name">{r.display_name} <span className="pair-result-url">({r.url})</span></div>
                <div className="pair-result-status">
                  {r.status === 'success' && '✓ Connected'}
                  {r.status === 'failed' && `✗ Error: ${r.error ?? 'unknown'}`}
                  {r.status === 'skipped' && '— Skipped'}
                </div>
              </div>
            ))}
          </div>
          <a href="/" className="btn btn-primary">Open the application</a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Transfer access from another device</h1>
        <p className="auth-subtitle">
          Paste the transfer link created on the old device.
          The encryption key stays in the link fragment and is never sent to the server.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={e => { void handleImport(e) }}>
          <div className="field">
            <label htmlFor="transfer-link">Transfer link</label>
            <input
              id="transfer-link"
              type="text"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="openspace://pair?relay=...&transfer_id=...#key=..."
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || !link}>
            {loading ? 'Transferring...' : 'Connect device'}
          </button>
        </form>
      </div>
    </div>
  )
}
