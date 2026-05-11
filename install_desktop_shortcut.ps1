$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$target = Join-Path $AppDir "launch_app.bat"
$shortcutPath = Join-Path $desktop "Language Annotation Studio.lnk"

if (-not (Test-Path -LiteralPath $target)) {
  throw "launch_app.bat was not found."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $AppDir
$shortcut.Description = "Start Language Annotation Studio"
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"
