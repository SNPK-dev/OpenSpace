$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $root "local-test-start.log"
Start-Transcript -LiteralPath $logPath -Force | Out-Null
trap {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $logPath"
  try { Stop-Transcript | Out-Null } catch {}
  Read-Host "Press Enter to close"
  exit 1
}

Set-Location -LiteralPath $root

Write-Host "Checking Docker..."
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Start Docker Desktop and run the server launcher again." }

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.InterfaceAlias -notmatch "WSL|Docker|Default Switch|Loopback"
  } |
  Sort-Object InterfaceMetric |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $lanAddress) { throw "Could not detect the local network address." }

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Host "Creating local settings..."
  node scripts/setup.mjs --non-interactive --local-network --domain openspace.lan --admin-email test@local.invalid
  if ($LASTEXITCODE -ne 0) { throw "Could not create local settings." }
}

function Set-EnvValue([string]$key, [string]$value) {
  $path = Join-Path $root ".env"
  $content = Get-Content -LiteralPath $path -Raw
  $pattern = "(?m)^$([regex]::Escape($key))=.*$"
  if ($content -match $pattern) {
    $content = [regex]::Replace($content, $pattern, "$key=$value")
  } else {
    $content = $content.TrimEnd() + "`r`n$key=$value`r`n"
  }
  [IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))
}

Set-EnvValue "APP_ENV" "development"
Set-EnvValue "PUBLIC_BASE_URL" "https://openspace.lan"
Set-EnvValue "ADMIN_BASE_URL" "https://openspace.lan/admin"
Set-EnvValue "WS_ALLOWED_ORIGINS" "https://openspace.lan,file://"
Set-EnvValue "OBJECT_STORAGE_PUBLIC_ENDPOINT" "files.openspace.lan"
Set-EnvValue "OBJECT_STORAGE_PUBLIC_USE_SSL" "true"
Set-EnvValue "LIVEKIT_PUBLIC_URL" "wss://openspace.lan/livekit"
Set-EnvValue "TURN_HOST" "openspace.lan"
Set-EnvValue "TURN_REALM" "openspace.lan"
Set-EnvValue "LAN_DOMAIN" "openspace.lan"
Set-EnvValue "LAN_FILES_DOMAIN" "files.openspace.lan"
node scripts/render-dev-configs.mjs .env
if ($LASTEXITCODE -ne 0) { throw "Could not render voice settings." }

Write-Host "Building and starting the server. The first run can take several minutes..."
docker compose -f docker-compose.yml -f docker-compose.lan-test.yml --env-file .env up -d --build
if ($LASTEXITCODE -ne 0) { throw "The server did not start. Review the output above." }

$certificatePath = Join-Path $root "openspace-local-ca.crt"
for ($attempt = 1; $attempt -le 30; $attempt++) {
  docker compose -f docker-compose.yml -f docker-compose.lan-test.yml --env-file .env cp caddy:/data/caddy/pki/authorities/local/root.crt ./openspace-local-ca.crt
  if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $certificatePath)) { break }
  Start-Sleep -Seconds 2
}
if (-not (Test-Path -LiteralPath $certificatePath)) { throw "Could not retrieve the local certificate." }

Write-Host ""
Write-Host "Server started: https://openspace.lan"
Write-Host "Local network address: $lanAddress"
& (Join-Path $PSScriptRoot "start-test-client.ps1") -Url "https://openspace.lan/admin/"
Stop-Transcript | Out-Null
