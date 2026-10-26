@echo off
setlocal
set "INSTALLER=%~dp0clients\windows\OpenSpace Setup 1.0.0-rc.1.exe"
if not exist "%INSTALLER%" (
  echo Installer not found: %INSTALLER%
  pause
  exit /b 1
)
start "" "%INSTALLER%"
