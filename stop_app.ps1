$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $AppDir "server.pid"

if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "server.pid was not found. If the app is running, close the node.exe process from Task Manager."
  exit 0
}

$pidContent = Get-Content -LiteralPath $pidPath -Raw -ErrorAction SilentlyContinue
$rawPid = if ($null -eq $pidContent) { "" } else { $pidContent.Trim() }
if (-not ($rawPid -match "^\d+$")) {
  Remove-Item -LiteralPath $pidPath -Force
  Write-Host "Removed invalid server.pid."
  exit 0
}

$process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $process.Id
  Write-Host "Stopped Annotator-Connotator server."
} else {
  Write-Host "Server process was not running."
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
