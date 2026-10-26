import { readFileSync } from 'node:fs'

const runtimeFiles = [
  'apps/server-api/internal/auth/service.go',
  'apps/server-api/internal/auth/middleware.go',
  'apps/server-api/internal/bootstrap/service.go',
  'apps/server-api/internal/devicereg/service.go',
  'apps/server-api/internal/redeem/service.go',
]
const migration = readFileSync('apps/server-api/internal/migrate/sql/033_hash_session_tokens.sql', 'utf8')
const failures = []

for (const file of runtimeFiles) {
  const source = readFileSync(file, 'utf8')
  if (/\bs\.token\b|\btoken\s*=\s*\$|sessions\s*\([^)]*\btoken\b/i.test(source)) failures.push(`${file}: plaintext session token SQL remains`)
}
for (const required of ["digest(token, 'sha256')", 'DROP COLUMN token', 'token_hash', 'UNIQUE INDEX']) {
  if (!migration.toUpperCase().includes(required.toUpperCase())) failures.push(`migration 033: missing ${required}`)
}
if (!readFileSync('apps/server-api/internal/sessiontoken/token.go', 'utf8').includes('sha256.Sum256')) failures.push('sessiontoken: SHA-256 digest missing')

if (failures.length) {
  console.error(`Session security validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`Session security validation passed (${runtimeFiles.length} session paths, no plaintext persistence).`)
