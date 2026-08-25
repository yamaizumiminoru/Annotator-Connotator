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

function Test-AppHealth($Url, $ExpectedVersion) {
  try {
    $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 2
    return (
      $response.ok -eq $true -and
      $response.app -eq "annotator-connotator" -and
      $response.version -eq $ExpectedVersion
    )
  } catch {
    return $false
  }
}

$port = [int](Read-EnvValue "PORT" "4174")
$healthUrl = "http://127.0.0.1:$port/api/health"
$pidPath = Join-Path $AppDir "server.pid"
$packagePath = Join-Path $AppDir "package.json"
$expectedVersion = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version
$appUrl = "http://localhost:$port/?v=$expectedVersion"

if (Test-AppHealth $healthUrl $expectedVersion) {
  Write-Host "Annotator-Connotator is already running: $appUrl"
} else {
  $node = Get-NodePath
  $youtubeModule = Join-Path $AppDir "node_modules\@hallelx\youtube-transcript\package.json"
  if (-not (Test-Path -LiteralPath $youtubeModule)) {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
      throw "npm.cmd was not found. Install Node.js with npm to enable YouTube transcript import."
    }
    Write-Host "Installing app dependencies..."
    & $npm.Source install --omit=dev --no-audit --no-fund --cache (Join-Path $AppDir ".npm-cache")
    if ($LASTEXITCODE -ne 0) {
      throw "App dependency installation failed."
    }
  }
  $outLog = Join-Path $AppDir "server.out.log"
  $errLog = Join-Path $AppDir "server.err.log"

  Write-Host "Starting Annotator-Connotator..."
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList "server-reason-selection.js" `
    -WorkingDirectory $AppDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ASCII

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 300
    if (Test-AppHealth $healthUrl $expectedVersion) {
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
