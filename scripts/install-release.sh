#!/usr/bin/env bash
set -euo pipefail
: "${OPENSPACE_REPOSITORY:?Set OPENSPACE_REPOSITORY, for example owner/OpenSpace}"
: "${OPENSPACE_VERSION:?Set OPENSPACE_VERSION, for example 1.0.0}"
command -v cosign >/dev/null || { echo "cosign is required" >&2; exit 1; }
base="https://github.com/${OPENSPACE_REPOSITORY}/releases/download/v${OPENSPACE_VERSION}"
artifact="openspace-v${OPENSPACE_VERSION}.tar.gz"
curl --proto '=https' --tlsv1.2 --fail --location --remote-name "$base/$artifact"
curl --proto '=https' --tlsv1.2 --fail --location --remote-name "$base/release-manifest.json"
curl --proto '=https' --tlsv1.2 --fail --location --remote-name "$base/release-manifest-final.sigstore.json"
cosign verify-blob --bundle release-manifest-final.sigstore.json --certificate-identity-regexp "^https://github.com/${OPENSPACE_REPOSITORY}/.github/workflows/release.yml@refs/tags/v${OPENSPACE_VERSION}$" --certificate-oidc-issuer https://token.actions.githubusercontent.com release-manifest.json
node --input-type=module -e 'import{createHash}from"node:crypto";import{readFileSync}from"node:fs";const m=JSON.parse(readFileSync("release-manifest.json"));const a=process.argv[1],e=m.artifacts.find(x=>x.name===a);if(!e||createHash("sha256").update(readFileSync(a)).digest("hex")!==e.sha256)throw Error("artifact checksum mismatch")' "$artifact"
tar -xzf "$artifact"
node "openspace-v${OPENSPACE_VERSION}/scripts/render-release-images.mjs" release-manifest.json "openspace-v${OPENSPACE_VERSION}/.release-images.env"
echo "Verified release extracted to openspace-v${OPENSPACE_VERSION}"
echo "Create openspace-v${OPENSPACE_VERSION}/.env, then deploy with:"
echo "  bash openspace-v${OPENSPACE_VERSION}/scripts/deploy-release.sh"
