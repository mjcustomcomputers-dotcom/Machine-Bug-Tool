@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "MPC_EXIT=1"

if exist "%~dp0MPC-Workspace.exe" goto run_portable
if exist "%~dp0node_modules\.bin\electron.cmd" goto run_source

echo MPC Workspace could not start.
echo.
echo Neither the portable MPC-Workspace.exe nor the prepared Electron dependency was found.
echo For a source checkout, run the repository's pinned dependency setup first.
goto failed

:run_portable
"%~dp0MPC-Workspace.exe"
set "MPC_EXIT=%ERRORLEVEL%"
goto finished

:run_source
call "%~dp0node_modules\.bin\electron.cmd" "%~dp0"
set "MPC_EXIT=%ERRORLEVEL%"
goto finished

:failed
set "MPC_EXIT=1"

:finished
if "%MPC_EXIT%"=="0" exit /b 0
echo.
echo MPC Workspace exited with code %MPC_EXIT%.
echo Logs are normally retained under %%APPDATA%%\MPC Workspace\logs.
pause
exit /b %MPC_EXIT%
