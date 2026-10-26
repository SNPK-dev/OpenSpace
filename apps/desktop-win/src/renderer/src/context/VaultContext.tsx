import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { createVault, unlockVault, resetPasswordWithRecovery, encryptWithMaster, type VaultCrypto, type CreateVaultResult } from '../crypto/vault'
import { setVaultUnlocked } from '../crypto/keypair'
import { setActiveServer, clearActiveServer } from '../api/client'
import { fetchServerMetadata, type ServerMetadata } from '../api/serverMeta'

export type ConnectionState =
  | 'discovered'
  | 'not_joined'
  | 'pending_approval'
  | 'joined'
  | 'unavailable'
  | 'revoked'
  | 'failed'

export type ServerConnectivityState = 'checking' | 'online' | 'degraded' | 'offline'

export interface ServerEntry {
  server_id: string
  name: string
  url: string
  avatar_url?: string | undefined
  connection_state: ConnectionState
  connectivity_state?: ServerConnectivityState
  device_id?: string
  server_identity_id?: string
  access_token?: string
  added_at: string
}

export interface LocalVaultProfile {
  name: string
  created_at: string
}

export interface VaultData {
  profile: LocalVaultProfile
  servers: ServerEntry[]
}

type ActiveVoiceWindow = Window & typeof globalThis & {
  __openspaceLeaveActiveVoice?: () => Promise<void>
}

async function leaveActiveVoice(): Promise<void> {
  await (window as ActiveVoiceWindow).__openspaceLeaveActiveVoice?.().catch(() => undefined)
}

interface VaultState {
  status: 'no_vault' | 'locked' | 'unlocked'
  profile: LocalVaultProfile | null
  servers: ServerEntry[]
  selectedServerId: string | null
}

interface VaultContextValue extends VaultState {
  createNewVault: (profileName: string, password: string) => Promise<{ recoveryCode: string }>
  unlock: (password: string) => Promise<void>
  recover: (recoveryCode: string, newPassword: string) => Promise<void>
  lock: () => void
  selectServer: (serverId: string) => void
  addServer: (entry: ServerEntry) => Promise<void>
  updateServer: (serverId: string, updates: Partial<ServerEntry>) => Promise<void>
  setServerConnectivity: (serverId: string, state: ServerConnectivityState) => void
  removeServer: (serverId: string) => Promise<void>
  getServerByUrl: (url: string) => ServerEntry | undefined
}

const VaultContext = createContext<VaultContextValue | null>(null)

const VAULT_CRYPTO_KEY = 'openspace_vault_crypto'
const VAULT_DB = 'openspace_vault'
const VAULT_STORE = 'vault'

async function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(VAULT_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveVaultCrypto(vaultCrypto: VaultCrypto): Promise<void> {
  const db = await openVaultDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readwrite')
    tx.objectStore(VAULT_STORE).put(vaultCrypto, VAULT_CRYPTO_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadVaultCrypto(): Promise<VaultCrypto | null> {
  const db = await openVaultDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readonly')
    const req = tx.objectStore(VAULT_STORE).get(VAULT_CRYPTO_KEY)
    req.onsuccess = () => resolve(req.result ? (req.result as VaultCrypto) : null)
    req.onerror = () => reject(req.error)
  })
}

let _masterKey: CryptoKey | null = null
let _vaultCrypto: VaultCrypto | null = null

const SERVER_PING_TIMEOUT_MS = 4_000
const SERVER_REPROBE_INTERVAL_MS = 30_000

interface ServerConnectivityResult {
  state: ServerConnectivityState
  metadata?: ServerMetadata
}

async function classifyServerConnectivity(server: ServerEntry): Promise<ServerConnectivityResult> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SERVER_PING_TIMEOUT_MS)
  try {
    const metadata = await fetchServerMetadata(server.url, { signal: controller.signal })
    return { state: 'online', metadata }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { state: 'offline' }
    if (err instanceof TypeError) return { state: 'offline' }
    return { state: 'degraded' }
  } finally {
    window.clearTimeout(timeout)
  }
}

async function persistVaultData(vaultData: VaultData): Promise<void> {
  if (!_masterKey || !_vaultCrypto) {
    console.error('[vault] persistVaultData: vault not unlocked (_masterKey:', !!_masterKey, '_vaultCrypto:', !!_vaultCrypto, ')')
    return
  }
  try {
    const persistedVaultData: VaultData = {
      ...vaultData,
      servers: vaultData.servers.map(({ connectivity_state: _connectivityState, ...server }) => server),
    }
    const { ciphertext, iv } = await encryptWithMaster(_masterKey, persistedVaultData)
    _vaultCrypto.encryptedVault = ciphertext
    _vaultCrypto.vaultIv = iv
    await saveVaultCrypto(_vaultCrypto)
    console.debug('[vault] persistVaultData: saved', vaultData.servers.length, 'servers')
  } catch (err) {
    console.error('[vault] persistVaultData failed:', err)
  }
}

const AVATAR_CACHE_PREFIX = 'openspace_avatar_'

function cacheAvatar(serverUrl: string, avatarUrl: string): void {
  try { localStorage.setItem(AVATAR_CACHE_PREFIX + serverUrl, avatarUrl) } catch {}
}

function getCachedAvatar(serverUrl: string): string | undefined {
  try { return localStorage.getItem(AVATAR_CACHE_PREFIX + serverUrl) ?? undefined } catch { return undefined }
}

function wsUrlFrom(serverUrl: string): string {
  return serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
}

function activateServer(server: ServerEntry): void {
  setActiveServer(server.url, wsUrlFrom(server.url), server.access_token ?? null)
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  // Dev-only E2E bypass: check synchronously in initial state so the first render
  // already sees 'unlocked' — avoiding the 'no_vault' → /onboarding redirect that
  // would otherwise fire before useEffect can correct it.
  const [state, setState] = useState<VaultState>(() => {
    if (import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('__e2e_skip_vault') === '1') {
      const token = localStorage.getItem('openspace_token')
      // Use empty apiBase so API calls go through the Vite proxy (/api → localhost:8080),
      // avoiding cross-origin issues between localhost:5176 (Vite) and localhost:8080 (server).
      setActiveServer('', 'ws://localhost:3001', token)
      setVaultUnlocked(true)
      // Provide a fake server entry so selectedServerId is non-null, which enables WSProvider
      // (WSProvider in App.tsx has enabled={!!selectedServerId}).
      const fakeServer: ServerEntry = {
        server_id: 'e2e-local-server',
        name: 'OpenSpace',
        url: '',
        connection_state: 'joined',
        connectivity_state: 'online',
        access_token: token ?? undefined,
        added_at: '',
      }
      return { status: 'unlocked', profile: { name: 'E2E', created_at: '' }, servers: [fakeServer], selectedServerId: 'e2e-local-server' }
    }
    return { status: 'no_vault', profile: null, servers: [], selectedServerId: null }
  })

  useEffect(() => {
    if (import.meta.env.DEV && localStorage.getItem('__e2e_skip_vault') === '1') return
    void loadVaultCrypto().then(vc => {
      if (vc) {
        _vaultCrypto = vc
        setState(s => ({ ...s, status: 'locked' }))
      }
    })
  }, [])

  const createNewVault = useCallback(async (profileName: string, password: string): Promise<{ recoveryCode: string }> => {
    const vaultData: VaultData = {
      profile: { name: profileName, created_at: new Date().toISOString() },
      servers: [],
    }
    const result: CreateVaultResult = await createVault(password, vaultData)
    _masterKey = result.masterKey
    _vaultCrypto = result.vaultCrypto
    setVaultUnlocked(true)
    await saveVaultCrypto(result.vaultCrypto)
    setState({ status: 'unlocked', profile: vaultData.profile, servers: [], selectedServerId: null })
    return { recoveryCode: result.recoveryCode }
  }, [])

  const unlock = useCallback(async (password: string) => {
    const vc = await loadVaultCrypto()
    if (!vc) throw new Error('no_vault')
    const { masterKey, vaultData } = await unlockVault(vc, password)
    _masterKey = masterKey
    _vaultCrypto = vc
    setVaultUnlocked(true)
    const data = vaultData as VaultData
    // Restore avatar_url from localStorage cache for servers that don't have it in vault
    const servers = (data.servers ?? []).map(({ connectivity_state: _legacyConnectivityState, ...server }) => ({
      ...server,
      avatar_url: server.avatar_url || getCachedAvatar(server.url) || undefined,
    }))
    const firstJoined = servers.find(s => s.connection_state === 'joined' && s.access_token)
    if (firstJoined) activateServer(firstJoined)
    setState({
      status: 'unlocked',
      profile: data.profile,
      servers,
      selectedServerId: firstJoined?.server_id ?? null,
    })
  }, [])

  const lock = useCallback(() => {
    void leaveActiveVoice()
    _masterKey = null
    setVaultUnlocked(false)
    clearActiveServer()
    setState({ status: 'locked', profile: null, servers: [], selectedServerId: null })
  }, [])

  const selectServer = useCallback((serverId: string) => {
    setState(s => {
      const server = s.servers.find(sv => sv.server_id === serverId)
      if (!server) return s
      activateServer(server)
      return { ...s, selectedServerId: serverId }
    })
  }, [])

  const addServer = useCallback(async (entry: ServerEntry) => {
    setState(s => {
      const existing = s.servers.find(sv => sv.server_id === entry.server_id)
      if (existing) return s
      const servers = [...s.servers, entry]
      void persistVaultData({ profile: s.profile!, servers })
      // Auto-select if nothing selected and this server is joined
      const shouldAutoSelect = !s.selectedServerId && entry.connection_state === 'joined' && entry.access_token
      if (shouldAutoSelect) activateServer(entry)
      return {
        ...s,
        servers,
        selectedServerId: shouldAutoSelect ? entry.server_id : s.selectedServerId,
      }
    })
  }, [])

  const updateServer = useCallback(async (serverId: string, updates: Partial<ServerEntry>) => {
    setState(s => {
      const servers = s.servers.map(sv => sv.server_id === serverId ? { ...sv, ...updates } : sv)
      void persistVaultData({ profile: s.profile!, servers })
      return { ...s, servers }
    })
  }, [])

  const setServerConnectivity = useCallback((serverId: string, connectivityState: ServerConnectivityState) => {
    setState(s => ({
      ...s,
      servers: s.servers.map(sv => sv.server_id === serverId ? { ...sv, connectivity_state: connectivityState } : sv),
    }))
  }, [])

  const recover = useCallback(async (recoveryCode: string, newPassword: string) => {
    const vc = await loadVaultCrypto()
    if (!vc) throw new Error('no_vault')
    const recovered = await resetPasswordWithRecovery(vc, recoveryCode.trim(), newPassword)
    await saveVaultCrypto(recovered.vaultCrypto)
    _masterKey = recovered.masterKey
    _vaultCrypto = recovered.vaultCrypto
    setVaultUnlocked(true)
    const data = recovered.vaultData as VaultData
    const servers = data.servers ?? []
    const firstJoined = servers.find(s => s.connection_state === 'joined' && s.access_token)
    if (firstJoined) activateServer(firstJoined)
    setState({ status: 'unlocked', profile: data.profile, servers, selectedServerId: firstJoined?.server_id ?? null })
  }, [])

  const serverProbeKey = state.servers
    .map(server => `${server.server_id}:${server.url}:${server.connection_state}`)
    .join('|')

  useEffect(() => {
    if (state.status !== 'unlocked') return
    // The development-only browser harness uses Vite's same-origin proxy and a
    // synthetic server entry with an intentionally empty public URL. Its
    // connectivity is established by the provisioned test stack, so probing
    // the empty metadata URL would incorrectly downgrade it to offline.
    if (import.meta.env.DEV && localStorage.getItem('__e2e_skip_vault') === '1') return
    const joinedServers = state.servers.filter(server => server.connection_state === 'joined')

    const probe = () => {
      joinedServers.forEach(server => {
        setServerConnectivity(server.server_id, 'checking')
        void classifyServerConnectivity(server).then(result => {
          console.debug('[vault] connectivity:', server.server_id, result.state, 'has metadata:', !!result.metadata)
          if (result.metadata) {
            if (result.metadata.avatar_url) cacheAvatar(server.url, result.metadata.avatar_url)
            void updateServer(server.server_id, {
              name: result.metadata.name || server.name,
              avatar_url: result.metadata.avatar_url || undefined,
            })
          }
          setServerConnectivity(server.server_id, result.state)
        })
      })
    }

    probe()
    const interval = window.setInterval(probe, SERVER_REPROBE_INTERVAL_MS)
    return () => window.clearInterval(interval)
    // serverProbeKey intentionally excludes ephemeral connectivity and metadata fields.
  }, [state.status, serverProbeKey, setServerConnectivity, updateServer])

  const removeServer = useCallback(async (serverId: string) => {
    if (state.selectedServerId === serverId) await leaveActiveVoice()
    setState(s => {
      const servers = s.servers.filter(sv => sv.server_id !== serverId)
      void persistVaultData({ profile: s.profile!, servers })
      const nextSelected = s.selectedServerId === serverId ? null : s.selectedServerId
      if (!nextSelected) clearActiveServer()
      return { ...s, servers, selectedServerId: nextSelected }
    })
  }, [state.selectedServerId])

  const getServerByUrl = useCallback((url: string) => {
    return state.servers.find(sv => sv.url === url)
  }, [state.servers])

  return (
    <VaultContext.Provider value={{
      ...state,
      createNewVault,
      unlock,
      recover,
      lock,
      selectServer,
      addServer,
      updateServer,
      setServerConnectivity,
      removeServer,
      getServerByUrl,
    }}>
      {children}
    </VaultContext.Provider>
  )
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used within VaultProvider')
  return ctx
}
