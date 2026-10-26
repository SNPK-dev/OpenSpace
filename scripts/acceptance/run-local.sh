#!/usr/bin/env bash
set -euo pipefail

previous_release="${1:-${PREVIOUS_RELEASE:-}}"
if [[ -z "$previous_release" ]]; then
  echo "usage: scripts/acceptance/run-local.sh <previous-stable-tag>" >&2
  exit 2
fi

export PREVIOUS_RELEASE="$previous_release"
acceptance_env=".acceptance.env"
cp .env.example "$acceptance_env"
sed -i -e 's/TURN_RELAY_PORT_START=50000/TURN_RELAY_PORT_START=52000/' -e 's/TURN_RELAY_PORT_END=50100/TURN_RELAY_PORT_END=52100/' "$acceptance_env"
export OPENSPACE_TRANSITION_ENV="$acceptance_env"
export OPENSPACE_RELEASE_REVISION="$(git rev-parse HEAD)"
export OPENSPACE_ACCEPT_HOST_BASELINE_CMD='test "$(. /etc/os-release; echo "$ID-$VERSION_ID")" = ubuntu-24.04 && test "$(uname -m)" = x86_64'
export OPENSPACE_ACCEPT_INSTALL_CMD='corepack enable && pnpm install --frozen-lockfile && node scripts/render-dev-configs.mjs .acceptance.env && docker compose --env-file .acceptance.env up -d --build'
export OPENSPACE_ACCEPT_SOCKET_POLICY_CMD='node scripts/validate-prod-topology.mjs'
export OPENSPACE_ACCEPT_BOOTSTRAP_CMD='node scripts/acceptance/bootstrap.mjs'
export OPENSPACE_ACCEPT_CHAT_CMD='API_TOKEN=$(cat .acceptance/admin-token) node scripts/e2e-text-chat-flow.mjs && node scripts/acceptance/bootstrap.mjs'
export OPENSPACE_ACCEPT_WEBSOCKET_RECONNECT_CMD='API_TOKEN=$(cat .acceptance/admin-token) node scripts/e2e-ws-realtime.mjs'
export OPENSPACE_ACCEPT_ATTACHMENT_ROUNDTRIP_CMD='API_TOKEN=$(cat .acceptance/admin-token) node scripts/e2e-files-dm-room-flow.mjs'
export OPENSPACE_ACCEPT_VOICE_LOCAL_CMD='API_TOKEN=$(cat .acceptance/admin-token) node scripts/e2e-voice-chat-flow.mjs'
export OPENSPACE_ACCEPT_BACKUP_CMD='node scripts/backup.mjs --env .acceptance.env --root .acceptance/backups --label clean-host'
export OPENSPACE_ACCEPT_INDEPENDENT_RESTORE_CMD='node scripts/recovery-drill.mjs'
export OPENSPACE_ACCEPT_PREVIOUS_VERSION_UPGRADE_CMD='node scripts/acceptance/release-transition.mjs --previous "$PREVIOUS_RELEASE" --upgrade-only'
export OPENSPACE_ACCEPT_ROLLBACK_CMD='node scripts/acceptance/release-transition.mjs --previous "$PREVIOUS_RELEASE" --rollback-only'

node scripts/acceptance/clean-host.mjs --output .acceptance/acceptance-evidence.json
