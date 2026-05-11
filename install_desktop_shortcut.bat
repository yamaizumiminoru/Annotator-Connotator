@echo off
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%install_desktop_shortcut.ps1"
