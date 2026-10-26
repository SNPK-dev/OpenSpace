import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const evidenceRoot = process.argv[2] ?? 'docs/evidence/client-quality'
const required = ['usability-session.json', 'nvda-smoke.json'].map(name => join(evidenceRoot, name))

const usabilityJourneys = [
  'invite-to-first-message',
  'second-device-pair-and-revoke',
  'offline-send-and-retry',
  'upload-failure-cancel-and-retry',
  'voice-reconnect',
  'lost-device-recovery',
  'operator-backup-upgrade-failure-recovery',
]
const nvdaJourneys = ['onboarding', 'messaging', 'pairing', 'file-upload', 'voice']

if (process.env.REQUIRE_CLIENT_HUMAN_EVIDENCE !== '1') {
  console.log('Client evidence contract present; human evidence is required by the release workflow')
  process.exit(0)
}

for (const path of required) {
  await access(path)
  const evidence = JSON.parse(await readFile(path, 'utf8'))
  if (evidence.schema_version !== 1 || evidence.result !== 'pass') throw new Error(`${path}: schema_version=1 and result=pass are required`)
  if (!evidence.completed_at || !evidence.environment || !Array.isArray(evidence.journeys) || !/^[a-f0-9]{40}$/i.test(evidence.release_sha ?? '')) {
    throw new Error(`${path}: missing completed_at, environment, journeys, or 40-character release_sha`)
  }
  if (evidence.blocking_findings !== 0) throw new Error(`${path}: blocking findings remain`)
  if (process.env.GITHUB_SHA && evidence.release_sha.toLowerCase() !== process.env.GITHUB_SHA.toLowerCase()) {
    throw new Error(`${path}: release_sha does not match GITHUB_SHA`)
  }
  const expectedJourneys = path.endsWith('usability-session.json') ? usabilityJourneys : nvdaJourneys
  for (const journey of expectedJourneys) {
    if (!evidence.journeys.includes(journey)) throw new Error(`${path}: missing required journey ${journey}`)
  }
  if (!Array.isArray(evidence.participants) || evidence.participants.some(participant => participant?.consent !== true || typeof participant?.anonymous_id !== 'string')) {
    throw new Error(`${path}: participants must contain anonymous_id and consent=true`)
  }
  const minimumParticipants = path.endsWith('usability-session.json') ? 2 : 1
  if (new Set(evidence.participants.map(participant => participant.anonymous_id)).size < minimumParticipants) {
    throw new Error(`${path}: requires at least ${minimumParticipants} distinct consenting participant(s)`)
  }
}
console.log('Human usability and NVDA evidence is complete')
