@echo off
setlocal
cd /d "%~dp0"
docker compose -f docker-compose.yml -f docker-compose.lan-test.yml --env-file .env down
if errorlevel 1 pause
