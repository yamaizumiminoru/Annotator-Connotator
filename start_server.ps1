param(
  [string]$Model = $(if ($env:OPENAI_MODEL) { $env:OPENAI_MODEL } else { "gpt-5.5" }),
  [int]$Port = 4174
)

Set-Location $PSScriptRoot

$env:OPENAI_MODEL = $Model
$env:PORT = [string]$Port

Write-Host "Starting Language Annotation Studio on http://localhost:$Port"
Write-Host "Model: $Model"
Write-Host "API key source: .env or current environment"
node server.js
