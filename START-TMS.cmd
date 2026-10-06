@echo off
setlocal
cd /d "%~dp0"
title RYAN TMS - Keep this window open
echo.
echo RYAN Transport Operations
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 from https://nodejs.org then run this file again.
  goto finish
)
node -e "if (Number(process.versions.node.split('.')[0]) !== 24) { console.error('Please install Node.js 24 from https://nodejs.org first.'); process.exit(1); }"
if errorlevel 1 goto finish
if not exist "node_modules\express\package.json" (
  echo Installing app dependencies. Internet access is needed for this first step.
  call npm ci --cache "%~dp0.local\npm-cache"
  if errorlevel 1 goto finish
)
if not exist "dist\index.html" (
  echo Building the dashboard...
  call npm run build
  if errorlevel 1 goto finish
)
echo Starting the app. Edge will open when the dashboard is ready.
call npm run open
:finish
echo.
echo You can close this window after you have finished using the app.
pause
