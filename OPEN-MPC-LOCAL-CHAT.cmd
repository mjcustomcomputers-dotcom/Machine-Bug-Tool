@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    "%ProgramFiles%\nodejs\node.exe" scripts\start-mpc-local-chat.mjs
    goto finished
  )
  echo Install the current Node.js LTS from https://nodejs.org/en/download
  echo Then reopen OPEN-MPC-LOCAL-CHAT.cmd.
  echo.
  pause
  exit /b 1
)
node.exe scripts\start-mpc-local-chat.mjs
:finished
echo.
echo MPC local chat has closed. Any startup error appears above.
pause
endlocal
