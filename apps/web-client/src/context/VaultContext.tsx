import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { createVault, unlockVault, resetPasswordWithRecovery, encryptWithMaster, type VaultCrypto, type CreateVaultResult } from '../crypto/vault'
import { setVaultUnlocked } from '../crypto/keypair'
import { setActiveServer, clearActiveServer } from '../api/client'
import { fetchServerMetadata, type ServerMetadata } from '../api/serverMeta'
import { createSerializedWriteQueue, withoutServerConnectivity } from './vaultPersistence'

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
  status: 'loading' | 'no_vault' | 'locked' | 'unlocked'
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

// We keep the master key and vault data in memory only (not in localStorage/sessionStorage)
let _masterKey: CryptoKey | null = null
let _vaultCrypto: VaultCrypto | null = null

const SERVER_PING_TIMEOUT_MS = 4_000
const E2E_SERVER_ID = 'e2e-local-server'

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

function wsUrlFrom(serverUrl: string): string {
  return serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
}

function activateServer(server: ServerEntry): void {
  setActiveServer(server.url, wsUrlFrom(server.url), server.access_token ?? null)
}

function createE2EUnlockedState(): VaultState {
  const accessToken = localStorage.getItem('openspace_token')
  const e2eServerUrl = localStorage.getItem('__e2e_server_url')
  const server: ServerEntry = {
    server_id: localStorage.getItem('__e2e_server_id') || E2E_SERVER_ID,
    name: localStorage.getItem('__e2e_server_name') || 'OpenSpace',
    url: e2eServerUrl ?? '',
    connection_state: 'joined',
    connectivity_state: 'online',
    added_at: new Date(0).toISOString(),
    ...(accessToken ? { access_token: accessToken } : {}),
  }
  setVaultUnlocked(true)
  activateServer(server)
  return {
    status: 'unlocked',
    profile: { name: 'E2E', created_at: '' },
    servers: [server],
    selectedServerId: server.server_id,
  }
}

const persistVaultData = createSerializedWriteQueue(async (vaultData: VaultData): Promise<void> => {
  if (!_masterKey || !_vaultCrypto) throw new Error('vault not unlocked')
  const persistedData = withoutServerConnectivity(vaultData)
  const { ciphertext, iv } = await encryptWithMaster(_masterKey, persistedData)
  const nextVaultCrypto = { ..._vaultCrypto, encryptedVault: ciphertext, vaultIv: iv }
  await saveVaultCrypto(nextVaultCrypto)
  const storedVaultCrypto = await loadVaultCrypto()
  if (
    !storedVaultCrypto ||
    storedVaultCrypto.encryptedVault !== nextVaultCrypto.encryptedVault ||
    storedVaultCrypto.vaultIv !== nextVaultCrypto.vaultIv
  ) {
    throw new Error('vault persistence verification failed')
  }
  _vaultCrypto = storedVaultCrypto
})

export function VaultProvider({ children }: { children: React.ReactNode }) {
  // Dev-only E2E bypass: check synchronously in initial state so the first render
  // already sees 'unlocked' — avoiding the 'no_vault' → /onboarding redirect that
  // would otherwise fire before useEffect can correct it.
  const [state, setState] = useState<VaultState>(() => {
    if (import.meta.env.DEV && typeof localStorage !== 'undefined' && localStorage.getItem('__e2e_skip_vault') === '1') {
      return createE2EUnlockedState()
    }
    return { status: 'loading', profile: null, servers: [], selectedServerId: null }
  })
  const stateRef = useRef(state)

  const commitState = useCallback((next: VaultState) => {
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (import.meta.env.DEV && localStorage.getItem('__e2e_skip_vault') === '1') return
    void loadVaultCrypto()
      .then(vc => {
        if (vc) {
          _vaultCrypto = vc
          setState(s => ({ ...s, status: 'locked', selectedServerId: null }))
          return
        }
        clearActiveServer()
        setState({ status: 'no_vault', profile: null, servers: [], selectedServerId: null })
      })
      .catch(() => {
        clearActiveServer()
        setState({ status: 'no_vault', profile: null, servers: [], selectedServerId: null })
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

    setState({
      status: 'unlocked',
      profile: vaultData.profile,
      servers: [],
      selectedServerId: null,
    })

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
    const servers = data.servers ?? []
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
    setState(s => ({ ...s, status: 'locked', profile: null, servers: [], selectedServerId: null }))
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
    const current = stateRef.current
    if (current.status !== 'unlocked' || !current.profile) throw new Error('vault not unlocked')
    const existing = current.servers.find(sv => sv.server_id === entry.server_id)
    if (existing) return
    const servers = [...current.servers, entry]
    const shouldAutoSelect = !current.selectedServerId && entry.connection_state === 'joined'
    const next = {
      ...current,
      servers,
      selectedServerId: shouldAutoSelect ? entry.server_id : current.selectedServerId,
    }
    stateRef.current = next
    try {
      await persistVaultData({ profile: current.profile, servers })
    } catch (error) {
      if (stateRef.current === next) stateRef.current = current
      throw error
    }
    if (shouldAutoSelect) activateServer(entry)
    setState(stateRef.current)
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

  const updateServer = useCallback(async (serverId: string, updates: Partial<ServerEntry>) => {
    const current = stateRef.current
    if (current.status !== 'unlocked' || !current.profile) throw new Error('vault not unlocked')
    const servers = current.servers.map(sv => sv.server_id === serverId ? { ...sv, ...updates } : sv)
    commitState({ ...current, servers })
    await persistVaultData({ profile: current.profile, servers })
  }, [commitState])

  const setServerConnectivity = useCallback((serverId: string, connectivityState: ServerConnectivityState) => {
    const current = stateRef.current
    commitState({
      ...current,
      servers: current.servers.map(sv => sv.server_id === serverId ? { ...sv, connectivity_state: connectivityState } : sv),
    })
  }, [commitState])

  useEffect(() => {
    if (state.status !== 'unlocked') return
    const uncheckedServers = state.servers.filter(server => server.connection_state === 'joined' && !server.connectivity_state)
    uncheckedServers.forEach(server => {
      setServerConnectivity(server.server_id, 'checking')
      void classifyServerConnectivity(server).then(result => {
        if (!result.metadata) {
          setServerConnectivity(server.server_id, result.state)
          return
        }
        void updateServer(server.server_id, {
          name: result.metadata.name || server.name,
          avatar_url: result.metadata.avatar_url || undefined,
        })
        setServerConnectivity(server.server_id, result.state)
      })
    })
  }, [state.status, state.servers, setServerConnectivity, updateServer])

  const removeServer = useCallback(async (serverId: string) => {
    const current = stateRef.current
    if (current.status !== 'unlocked' || !current.profile) throw new Error('vault not unlocked')
    const servers = current.servers.filter(sv => sv.server_id !== serverId)
    const nextSelected = current.selectedServerId === serverId ? null : current.selectedServerId
    if (!nextSelected) clearActiveServer()
    commitState({ ...current, servers, selectedServerId: nextSelected })
    const persistence = persistVaultData({ profile: current.profile, servers })
    if (current.selectedServerId === serverId) await leaveActiveVoice()
    await persistence
  }, [commitState])

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
