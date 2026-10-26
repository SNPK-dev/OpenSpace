import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/security/authorization-matrix.mjs"], { stdio: "inherit" });
const required = ["docs/security/authorization-matrix.md", "docs/security/threat-model.md", "docs/security/independent-review.md", "apps/server-api/internal/sessiontoken/token_fuzz_test.go", "apps/realtime-gateway/internal/gateway/parser_fuzz_test.go", ".github/workflows/security.yml"];
const missing = required.filter((path) => !existsSync(path));
const workflow = existsSync(required.at(-1)) ? readFileSync(required.at(-1), "utf8") : "";
for (const marker of ["go test -race", "-fuzz=", "gosec", "govulncheck", "semgrep", "CodeQL", "gitleaks", "security-review-evidence"]) if (!workflow.includes(marker)) missing.push(`security workflow missing ${marker}`);
if (missing.length) { console.error(missing); process.exit(1); }
console.log(`authorization/security validation passed: ${required.length} artifacts`);
