@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
    echo MPC Work requires an installed Node.js 22.13 or newer on PATH.
    if "%~1"=="" pause
    exit /b 1
)
node.exe "%~dp0scripts\run-mpc-work.mjs" %*
set "MpcWorkExit=%errorlevel%"
if "%~1"=="" pause
exit /b %MpcWorkExit%
