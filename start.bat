@echo off
chcp 65001 >nul
title Sud Bot
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js not found.
  echo  Install Node.js 18+ from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo  [ERROR] No .env file with the token.
  echo  Copy .env.example to .env and set DISCORD_TOKEN.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  First run: installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [ERROR] Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo.
echo  Starting bot. Close this window or press Ctrl+C to stop.
echo.
echo  ----------------------------------------
echo.

node index.js

echo.
echo  ----------------------------------------
echo  Bot stopped.
if errorlevel 1 (
  echo  See the error above. Most likely an invalid token.
  echo  Check it with: node scripts\check-token.js
)
echo.
pause