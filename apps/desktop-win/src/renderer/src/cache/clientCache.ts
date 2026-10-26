import type { Channel, DMConversation, DMMessagesPage, MessagesPage, Room } from '../api/types'

const CACHE_DB = 'openspace_client_cache'
const CACHE_STORE = 'records'

interface CacheRecord<T> {
  key: string
  value: T
  cached_at: string
}

async function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE, { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putCache<T>(key: string, value: T): Promise<void> {
  const db = await openCacheDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite')
    tx.objectStore(CACHE_STORE).put({ key, value, cached_at: new Date().toISOString() } satisfies CacheRecord<T>)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getCache<T>(key: string): Promise<CacheRecord<T> | null> {
  const db = await openCacheDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const req = tx.objectStore(CACHE_STORE).get(key)
    req.onsuccess = () => resolve(req.result ? (req.result as CacheRecord<T>) : null)
    req.onerror = () => reject(req.error)
  })
}

const key = {
  rooms: (serverId: string) => `${serverId}:rooms`,
  channels: (serverId: string, roomId: string) => `${serverId}:rooms:${roomId}:channels`,
  dmConversations: (serverId: string) => `${serverId}:dm:conversations`,
  channelMessages: (serverId: string, channelId: string) => `${serverId}:channels:${channelId}:messages`,
  dmMessages: (serverId: string, convId: string) => `${serverId}:dm:${convId}:messages`,
}

export const clientCache = {
  saveRooms: (serverId: string, rooms: Room[]) => putCache(key.rooms(serverId), rooms),
  loadRooms: async (serverId: string) => (await getCache<Room[]>(key.rooms(serverId)))?.value ?? null,

  saveChannels: (serverId: string, roomId: string, channels: Channel[]) => putCache(key.channels(serverId, roomId), channels),
  loadChannels: async (serverId: string, roomId: string) => (await getCache<Channel[]>(key.channels(serverId, roomId)))?.value ?? null,

  saveDMConversations: (serverId: string, conversations: DMConversation[]) => putCache(key.dmConversations(serverId), conversations),
  loadDMConversations: async (serverId: string) => (await getCache<DMConversation[]>(key.dmConversations(serverId)))?.value ?? null,

  saveChannelMessages: (serverId: string, channelId: string, page: MessagesPage) => putCache(key.channelMessages(serverId, channelId), page),
  loadChannelMessages: async (serverId: string, channelId: string) => (await getCache<MessagesPage>(key.channelMessages(serverId, channelId)))?.value ?? null,

  saveDMMessages: (serverId: string, convId: string, page: DMMessagesPage) => putCache(key.dmMessages(serverId, convId), page),
  loadDMMessages: async (serverId: string, convId: string) => (await getCache<DMMessagesPage>(key.dmMessages(serverId, convId)))?.value ?? null,
}
