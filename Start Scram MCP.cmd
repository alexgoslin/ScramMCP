@echo off
rem Double-click to start Scram MCP on Windows.
rem It starts Electron directly: on some Windows PCs "npm start" fails with "spawn UNKNOWN".
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing Scram MCP. This takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installing failed. Is Node.js installed? Get it from https://nodejs.org/
    pause
    exit /b 1
  )
)
start "" "node_modules\electron\dist\electron.exe" .
