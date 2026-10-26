param([string]$Url = "https://openspace.lan")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$profile = Join-Path $root ".test-client-profile"
$edgeCandidates = @(@(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
if ($edgeCandidates.Count -eq 0) { throw "Microsoft Edge was not found." }
Start-Process -FilePath $edgeCandidates[0] -ArgumentList "--user-data-dir=`"$profile`"", "--host-resolver-rules=`"MAP openspace.lan 127.0.0.1, MAP files.openspace.lan 127.0.0.1`"", "--ignore-certificate-errors", "--no-first-run", "--new-window", $Url
