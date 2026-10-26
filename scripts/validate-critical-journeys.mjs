import { readFile } from 'node:fs/promises'

const coverage = [
  ['invite expiry/revocation UI recovery', 'apps/web-client/e2e/resilient-journeys.spec.ts', ['invite_expired', 'invite_revoked', 'keeps the invite step recoverable']],
  ['pairing expiry/revocation', 'apps/server-api/internal/redeem/token_test.go', ['ErrTokenExpired', 'revoked token: expected ErrTokenUsed']],
  ['offline message retry', 'apps/web-client/e2e/messages.spec.ts', ['offline send preserves the draft and succeeds on retry']],
  ['upload success/cancel/quota', 'apps/web-client/e2e/messages.spec.ts', ['uploads, sends, and exposes a downloadable attachment', 'cancelled upload retains a deterministic retry state', 'oversized attachment is rejected before network upload']],
  ['voice reconnect', 'apps/web-client/e2e/voice.spec.ts', ['Ctrl+R while in voice', 'auto-rejoin after reload']],
  ['lost vault password recovery', 'apps/web-client/scripts/vault-recovery.test.ts', ['recovery code resets password', 'resetPasswordWithRecovery']],
  ['revoked identity authorization', 'apps/server-api/internal/dm/security_integration_test.go', ['disabled recipient accepted']],
  ['operator backup failure recovery', 'scripts/tests/backup-bundle.test.mjs', ['corruption is rejected', 'incomplete bundle is rejected', 'subprocess failures are fail-closed']],
  ['upgrade and rollback acceptance', 'scripts/acceptance/clean-host.mjs', ['previous-version-upgrade', 'rollback']],
  ['permission-aware attachment action', 'apps/web-client/src/panes/ChatPane.tsx', ["permissions.includes('file.upload')"]],
]

for (const [journey, path, markers] of coverage) {
  const source = await readFile(path, 'utf8')
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${journey}: missing ${marker} in ${path}`)
  }
}

console.log(`Critical-journey coverage contract passed: ${coverage.length} journeys`)
