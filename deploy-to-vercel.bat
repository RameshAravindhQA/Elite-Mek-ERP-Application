@echo off
REM Elite-Mek ERP Backend Deployment to Vercel
REM This script deploys the backend to Vercel using Supabase PostgreSQL

REM Set Supabase Database URL
set "DATABASE_URL=postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"

REM Set environment
set "NODE_ENV=production"

echo.
echo ================================================
echo Elite-Mek ERP - Vercel Deployment Script
echo ================================================
echo.

REM Check if vercel CLI is installed
where vercel >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Vercel CLI not found. Install it with:
    echo npm install -g vercel
    exit /b 1
)

REM Check if pnpm is installed
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found. Install it with:
    echo npm install -g pnpm
    exit /b 1
)

echo [1/4] Installing dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)

echo.
echo [2/4] Testing Supabase database connection...
call pnpm --filter @workspace/db run push
if errorlevel 1 (
    echo [WARNING] Database schema push failed. Continuing with deployment...
)

echo.
echo [3/4] Building for Vercel...
cd backend
call pnpm run build:vercel
if errorlevel 1 (
    echo [ERROR] Vercel build failed
    cd ..
    exit /b 1
)
cd ..

echo.
echo [4/4] Deploying to Vercel...
REM Use --prod flag for production deployment
REM Comment out --prod for preview deployment
call vercel --prod --env DATABASE_URL=%DATABASE_URL% --env NODE_ENV=%NODE_ENV%

if errorlevel 1 (
    echo.
    echo [ERROR] Deployment failed. Check Vercel logs at:
    echo https://vercel.com/dashboard
    exit /b 1
)

echo.
echo ================================================
echo [SUCCESS] Deployment completed!
echo ================================================
echo.
echo Your backend is now live at:
echo https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api
echo.
echo Test the health endpoint:
echo https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
echo.
pause
