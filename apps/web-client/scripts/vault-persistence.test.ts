import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSerializedWriteQueue,
  withoutServerConnectivity,
} from '../src/context/vaultPersistence.ts'

test('concurrent vault mutations write current snapshots in invocation order', async () => {
  type Snapshot = { servers: Array<{ server_id: string }> }
  const writes: Snapshot[] = []
  let releaseFirst!: () => void
  const firstWriteGate = new Promise<void>(resolve => {
    releaseFirst = resolve
  })

  const enqueue = createSerializedWriteQueue<Snapshot>(async snapshot => {
    if (writes.length === 0) await firstWriteGate
    writes.push(snapshot)
  })

  let current: Snapshot = { servers: [] }
  const addServer = (server_id: string) => {
    current = { servers: [...current.servers, { server_id }] }
    return enqueue(current)
  }

  const first = addServer('one')
  const second = addServer('two')
  releaseFirst()
  await Promise.all([first, second])

  assert.deepEqual(writes, [
    { servers: [{ server_id: 'one' }] },
    { servers: [{ server_id: 'one' }, { server_id: 'two' }] },
  ])
})

test('a failed write does not prevent the next queued snapshot', async () => {
  const writes: number[] = []
  const enqueue = createSerializedWriteQueue<number>(async snapshot => {
    if (snapshot === 1) throw new Error('simulated IndexedDB failure')
    writes.push(snapshot)
  })

  await assert.rejects(enqueue(1), /simulated IndexedDB failure/)
  await enqueue(2)

  assert.deepEqual(writes, [2])
})

test('persisted snapshots omit connectivity without mutating runtime state', () => {
  const runtime = {
    profile: { name: 'Local' },
    servers: [{ server_id: 'one', connectivity_state: 'online', connection_state: 'joined' }],
  }

  const persisted = withoutServerConnectivity(runtime)

  assert.deepEqual(persisted.servers, [{ server_id: 'one', connection_state: 'joined' }])
  assert.equal(runtime.servers[0].connectivity_state, 'online')
})
