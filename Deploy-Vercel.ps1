#!/usr/bin/env pwsh
<#
.SYNOPSIS
Elite-Mek ERP Backend Deployment to Vercel

.DESCRIPTION
Deploys the backend to Vercel using Supabase PostgreSQL connection

.EXAMPLE
.\Deploy-Vercel.ps1
.\Deploy-Vercel.ps1 -Preview  # For preview deployment
#>

param(
    [switch]$Preview
)

$ErrorActionPreference = "Stop"

# Supabase Database URL
$env:DATABASE_URL = "postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=disable"
$env:NODE_ENV = "production"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Elite-Mek ERP - Vercel Deployment Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if vercel CLI is installed
try {
    $vercelVersion = vercel --version 2>$null
    Write-Host "[+] Vercel CLI found: $vercelVersion" -ForegroundColor Green
}
catch {
    Write-Host "[-] Vercel CLI not found. Install with:" -ForegroundColor Red
    Write-Host "npm install -g vercel" -ForegroundColor Yellow
    exit 1
}

# Check if pnpm is installed
try {
    $pnpmVersion = pnpm --version 2>$null
    Write-Host "[+] pnpm found: $pnpmVersion" -ForegroundColor Green
}
catch {
    Write-Host "[-] pnpm not found. Install with:" -ForegroundColor Red
    Write-Host "npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[1/5] Installing dependencies..." -ForegroundColor Yellow
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[-] Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "[+] Dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "[2/5] Verifying Supabase connection..." -ForegroundColor Yellow
try {
    $env:DATABASE_URL = "postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
    pnpm --filter @workspace/db run push
    Write-Host "[+] Database connection verified" -ForegroundColor Green
}
catch {
    Write-Host "[!] Database schema push warning: $_" -ForegroundColor Yellow
    Write-Host "[>] Continuing with deployment..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/5] Building for Vercel..." -ForegroundColor Yellow
Push-Location backend
try {
    pnpm run build:vercel
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[-] Vercel build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "[+] Vercel build completed" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "[4/5] Preparing deployment..." -ForegroundColor Yellow
$vercelArgs = @()
if (-not $Preview) {
    $vercelArgs += "--prod"
    Write-Host "[>] Production deployment mode" -ForegroundColor Cyan
}
else {
    Write-Host "[>] Preview deployment mode" -ForegroundColor Cyan
}
$vercelArgs += "--env"
$vercelArgs += "DATABASE_URL=$env:DATABASE_URL"
$vercelArgs += "--env"
$vercelArgs += "NODE_ENV=$env:NODE_ENV"

Write-Host ""
Write-Host "[5/5] Deploying to Vercel..." -ForegroundColor Yellow
Write-Host "Command: vercel $($vercelArgs -join ' ')" -ForegroundColor Gray
Write-Host ""

vercel @vercelArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[-] Deployment failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check logs at: https://vercel.com/dashboard" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "[+] Deployment Completed Successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your backend is now live at:" -ForegroundColor Cyan
Write-Host "https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api" -ForegroundColor Green
Write-Host ""
Write-Host "Test the health endpoint:" -ForegroundColor Cyan
Write-Host "https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz" -ForegroundColor Green
Write-Host ""
Write-Host "View deployment logs:" -ForegroundColor Cyan
Write-Host "https://vercel.com/dashboard" -ForegroundColor Green
Write-Host ""
