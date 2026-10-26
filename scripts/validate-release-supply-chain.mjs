import { existsSync, readFileSync } from "node:fs";
const paths = ["scripts/validate-release-version.mjs", "scripts/verify-release.mjs", "scripts/finalize-release-manifest.mjs", "scripts/deploy-release.sh", "scripts/upgrade-release.mjs", "scripts/rollback-release.mjs", "docs/security/vulnerability-policy.md", "docs/support-matrix.md", ".github/workflows/release.yml"];
const failures = paths.filter((path) => !existsSync(path));
const workflow = existsSync(paths.at(-1)) ? readFileSync(paths.at(-1), "utf8") : "";
for (const marker of ["platforms: linux/amd64,linux/arm64", "sbom: true", "provenance: mode=max", "cosign sign", "aquasecurity/trivy-action", "attest-build-provenance", "windows-latest", "signtool", "validate-release-version.mjs", "client-human-evidence", ".spdx.json", "trivy-${{ matrix.name }}.sarif", "*.yml", "*.blockmap", "artifact-acceptance"]) if (!workflow.includes(marker)) failures.push(`release workflow missing ${marker}`);
if (failures.length) { console.error(failures); process.exit(1); }
console.log(`release supply-chain validation passed: ${paths.length} artifacts`);
