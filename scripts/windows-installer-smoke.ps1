param(
  [Parameter(Mandatory = $true)][string]$PreviousInstaller,
  [Parameter(Mandatory = $true)][string]$Installer
)
$ErrorActionPreference = "Stop"
$previous = (Resolve-Path -LiteralPath $PreviousInstaller).Path
$resolved = (Resolve-Path -LiteralPath $Installer).Path
$vault = Join-Path $env:APPDATA "OpenSpace"
New-Item -ItemType Directory -Force -Path $vault | Out-Null
$sentinel = Join-Path $vault "release-smoke-vault-preservation"
Set-Content -LiteralPath $sentinel -Value "preserve" -NoNewline
$previousInstall = Start-Process -FilePath $previous -ArgumentList "/S" -Wait -PassThru
if ($previousInstall.ExitCode -ne 0) { throw "previous installer failed: $($previousInstall.ExitCode)" }
$install = Start-Process -FilePath $resolved -ArgumentList "/S" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "upgrade installer failed: $($install.ExitCode)" }
if (-not (Test-Path -LiteralPath $sentinel)) { throw "upgrade removed vault sentinel" }
$uninstaller = Get-ChildItem "$env:LOCALAPPDATA\Programs\OpenSpace\Uninstall*.exe" | Select-Object -First 1
if (-not $uninstaller) { throw "uninstaller not found" }
$uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "uninstaller failed: $($uninstall.ExitCode)" }
if (-not (Test-Path -LiteralPath $sentinel)) { throw "uninstaller removed vault without consent" }
