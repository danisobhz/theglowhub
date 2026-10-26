@echo off
cd /d "%~dp0"
title Aurel - Local Shop
echo Your shop will be available at http://localhost:3000
echo Your admin will be available at http://localhost:3000/admin
echo Keep this window open while using the shop.
echo.
node server.mjs
pause
