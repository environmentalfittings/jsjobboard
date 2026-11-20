@echo off
cd /d "%~dp0"
if not exist package.json (
  echo ERROR: Run this from the jsjobboard project folder.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Starting app at http://localhost:5173 ...
call npm run dev
pause
