@echo off
setlocal EnableExtensions

cd /d "%~dp0apps\web" || (
  echo Could not cd to apps\web
  exit /b 1
)

where bun >nul 2>&1
if errorlevel 1 (
  echo Install Bun from https://bun.sh and ensure it is on PATH.
  exit /b 1
)

REM Prisma CLI reads .env (not .env.local). Sync so migrate/generate see DATABASE_URL.
if exist .env.local (
  copy /y .env.local .env >nul
)

echo Installing dependencies...
call bun install
if errorlevel 1 exit /b 1

echo Generating Prisma client...
call bun run prisma:generate
if errorlevel 1 exit /b 1

echo Applying database migrations...
call bunx prisma migrate deploy
if errorlevel 1 exit /b 1

echo Starting dev server at http://localhost:3000
call bun run dev
