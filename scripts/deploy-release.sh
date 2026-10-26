#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${1:-$root/.env}"
images_file="${2:-$root/.release-images.env}"
compose_file="$root/docker-compose.prod.yml"
project_name="${OPENSPACE_COMPOSE_PROJECT_NAME:-openspace}"
readiness_url="${OPENSPACE_READINESS_URL:-$(sed -n 's/^PUBLIC_BASE_URL=//p' "$env_file")/readyz}"

for file in "$env_file" "$images_file" "$compose_file"; do
  [[ -f "$file" ]] || { echo "required release file is missing: $file" >&2; exit 1; }
done

required_images=(
  OPENSPACE_API_IMAGE OPENSPACE_GATEWAY_IMAGE OPENSPACE_WORKER_IMAGE
  OPENSPACE_ADMIN_WEB_IMAGE OPENSPACE_WEB_IMAGE
)
for key in "${required_images[@]}"; do
  value="$(sed -n "s/^${key}=//p" "$images_file")"
  [[ "$value" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] || {
    echo "$key must be an immutable digest-qualified image" >&2
    exit 1
  }
done

cd "$root"
node scripts/render-prod-configs.mjs "$env_file"
compose=(docker compose -p "$project_name" -f "$compose_file")
if [[ -n "${OPENSPACE_COMPOSE_OVERRIDE:-}" ]]; then
  [[ -f "$OPENSPACE_COMPOSE_OVERRIDE" ]] || { echo "compose override is missing: $OPENSPACE_COMPOSE_OVERRIDE" >&2; exit 1; }
  compose+=(-f "$OPENSPACE_COMPOSE_OVERRIDE")
fi
compose+=(--env-file "$env_file" --env-file "$images_file")
"${compose[@]}" config --quiet
"${compose[@]}" pull --quiet
"${compose[@]}" up -d --no-build --remove-orphans

deadline=$((SECONDS + 180))
until curl --fail --silent --show-error "$readiness_url" >/dev/null; do
  (( SECONDS < deadline )) || { echo "release readiness timed out" >&2; exit 1; }
  sleep 5
done
echo "Verified immutable release deployment is ready."
