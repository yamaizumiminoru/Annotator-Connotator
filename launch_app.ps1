param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir

function Read-EnvValue($Name, $Default) {
  $envPath = Join-Path $AppDir ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return $Default
  }

  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match "^\s*$Name\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $Default
  }

  $value = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value
}

function Get-NodePath {
  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\node.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw "node.exe was not found. Install Node.js or start the app from Codex."
}

function Test-AppHealth($Url) {
  try {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
    return ($response.ok -eq $true)
  } catch {
    return $false
  }
}

$port = [int](Read-EnvValue "PORT" "4174")
$healthUrl = "http://localhost:$port/api/health"
$appUrl = "http://localhost:$port"
$pidPath = Join-Path $AppDir "server.pid"

if (Test-AppHealth $healthUrl) {
  Write-Host "Language Annotation Studio is already running: $appUrl"
} else {
  $node = Get-NodePath
  $outLog = Join-Path $AppDir "server.out.log"
  $errLog = Join-Path $AppDir "server.err.log"

  Write-Host "Starting Language Annotation Studio..."
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList "server.js" `
    -WorkingDirectory $AppDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 300
    if (Test-AppHealth $healthUrl) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Write-Host "Server did not become ready. Check server.err.log."
    exit 1
  }

  Write-Host "Started: $appUrl"
}

if (-not $NoOpen) {
  Start-Process $appUrl
}
