@echo off
chcp 65001 >nul
title Sud Bot - Set Token
cd /d "%~dp0"

echo.
echo  ===========================================================
echo   BOT TOKEN SETUP
echo  ===========================================================
echo.
echo  1. Open https://discord.com/developers/applications
echo  2. Pick your app  -^)  Bot  -^)  Authorization
echo  3. Click "Reset Token" and copy it (shown only once)
echo  4. Paste it below (input is hidden, just press Ctrl+V then Enter)
echo.
echo  DO NOT paste the token into chat. Type it here only.
echo.
echo  ===========================================================
echo.

set /p TOKEN=  Paste bot token: 

if "%TOKEN%"=="" (
  echo.
  echo  [ERROR] Empty token, nothing written.
  pause
  exit /b 1
)

if not exist ".env" (
  > .env echo DISCORD_TOKEN=%TOKEN%
  > .env echo DISCORD_CLIENT_ID=1558214657137975357
  >> .env echo DISCORD_PUBLIC_KEY=435bd5cb0ab2b7e24776bb6f1911bc3481b1724edd7b2cf367140cd0a3a65d1b
) else (
  node -e "const fs=require('fs');const t=process.argv[1].trim().replace(/^['\"]|['\"]\$/g,'');const f='.env';const lines=fs.readFileSync(f,'utf8').split(/\r?\n/).filter(l=>l.trim()&&!/^DISCORD_TOKEN=/.test(l));fs.writeFileSync(f,['DISCORD_TOKEN='+t,...lines].join('\n')+'\n')" "%TOKEN%"
)

echo.
echo  [OK] Token written to .env
echo.
echo  Now running the check...
echo.
node scripts\check-token.js

echo.
pause