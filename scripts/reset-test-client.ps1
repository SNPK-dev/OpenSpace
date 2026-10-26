$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$profile = Join-Path $root ".test-client-profile"

$answer = Read-Host "Delete the isolated local test profile? Server data will remain. Type YES"
if ($answer -ne "YES") {
  Write-Host "Cancelled."
  exit 0
}

Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path -LiteralPath $profile) {
  Remove-Item -LiteralPath $profile -Recurse -Force
}
Write-Host "The isolated test profile was deleted. Run the client launcher again."
