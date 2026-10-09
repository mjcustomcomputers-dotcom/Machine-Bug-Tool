@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0Run-Reasoning-Intelligence.ps1" %*
exit /b %errorlevel%
