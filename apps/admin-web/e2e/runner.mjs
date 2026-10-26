#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

if (!process.env.ADMIN_API_TOKEN) {
  if (process.env.E2E_OPTIONAL === '1') {
    console.log('Playwright e2e explicitly skipped: E2E_OPTIONAL=1 and ADMIN_API_TOKEN is not set.')
    process.exit(0)
  }
  console.error('Playwright e2e prerequisite missing: ADMIN_API_TOKEN. Set E2E_OPTIONAL=1 only for an explicit local skip.')
  process.exit(2)
}

const result = spawnSync('pnpm', ['exec', 'playwright', 'test'], {
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)
