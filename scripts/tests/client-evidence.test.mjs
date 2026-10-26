import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const validator = resolve('scripts/validate-client-evidence.mjs')
const releaseSha = 'a'.repeat(40)
const usabilityJourneys = [
  'invite-to-first-message', 'second-device-pair-and-revoke', 'offline-send-and-retry',
  'upload-failure-cancel-and-retry', 'voice-reconnect', 'lost-device-recovery',
  'operator-backup-upgrade-failure-recovery',
]
const nvdaJourneys = ['onboarding', 'messaging', 'pairing', 'file-upload', 'voice']

async function fixture(mutator = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'openspace-client-evidence-'))
  const base = { schema_version: 1, completed_at: new Date().toISOString(), release_sha: releaseSha, environment: 'test', blocking_findings: 0, result: 'pass' }
  const records = {
    usability: { ...base, participants: [{ anonymous_id: 'p1', consent: true }, { anonymous_id: 'p2', consent: true }], journeys: usabilityJourneys },
    nvda: { ...base, participants: [{ anonymous_id: 'p1', consent: true }], journeys: nvdaJourneys },
  }
  mutator(records)
  await writeFile(join(root, 'usability-session.json'), JSON.stringify(records.usability))
  await writeFile(join(root, 'nvda-smoke.json'), JSON.stringify(records.nvda))
  return root
}

function validate(root) {
  return spawnSync(process.execPath, [validator, root], { encoding: 'utf8', env: { ...process.env, REQUIRE_CLIENT_HUMAN_EVIDENCE: '1', GITHUB_SHA: releaseSha } })
}

test('accepts complete consented evidence tied to the release SHA', async () => {
  const root = await fixture()
  try { assert.equal(validate(root).status, 0) } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects a single unfamiliar-user participant', async () => {
  const root = await fixture(records => { records.usability.participants.pop() })
  try { assert.notEqual(validate(root).status, 0) } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects missing required journeys and a mismatched release SHA', async () => {
  const root = await fixture(records => { records.nvda.journeys.pop(); records.nvda.release_sha = 'b'.repeat(40) })
  try { assert.notEqual(validate(root).status, 0) } finally { await rm(root, { recursive: true, force: true }) }
})
