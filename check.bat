@echo off
chcp 65001 >nul
title Sud Bot - Check
cd /d "%~dp0"

echo.
echo  ====================== CHECK ======================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js not found. Install Node.js 18+.
  pause
  exit /b 1
)

echo  [1/3] Token and application...
echo.
node scripts\check-token.js
if errorlevel 1 (
  echo.
  echo  [DONE] Token check failed. Fix the token before using start.bat.
  echo.
  pause
  exit /b 1
)

echo.
echo  [2/3] Logic tests...
echo.
call npm test

echo.
echo  [3/3] Invite link:
echo.
node scripts\invite.js

echo.
echo  ================================================
echo  All good. Run start.bat
echo  ================================================
echo.
pause