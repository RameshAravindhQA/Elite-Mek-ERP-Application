$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-EnvValue($Name, $Default) {
  if (Test-Path (Join-Path $Root ".env")) {
    $line = Get-Content (Join-Path $Root ".env") | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))=" } | Select-Object -First 1
    if ($line) {
      return ($line -replace "^\s*$([regex]::Escape($Name))=", "").Trim().Trim('"').Trim("'")
    }
  }
  $existing = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ($existing) { return $existing }
  return $Default
}

function Resolve-Pnpm {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) { return @($pnpm.Source) }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) { return @($corepack.Source, "pnpm") }

  throw "pnpm is required. Install it with: npm install -g pnpm or enable Corepack with: corepack enable"
}

function Invoke-Checked([string[]]$ArgsToRun, [string]$WorkingDirectory = $Root) {
  Push-Location $WorkingDirectory
  try {
    if ($ArgsToRun.Count -gt 1) {
      & $ArgsToRun[0] $ArgsToRun[1..($ArgsToRun.Count - 1)]
    } else {
      & $ArgsToRun[0]
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $($ArgsToRun -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Stop-Port($Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}
    }
}

$DatabaseUrl = Get-EnvValue "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/postgres"
$BackendPort = [int](Get-EnvValue "BACKEND_START_PORT" "3000")
$RunSchemaPush = Get-EnvValue "RUN_SCHEMA_PUSH" "1"
$EnsureAdminLogin = Get-EnvValue "ENSURE_ADMIN_LOGIN" "1"
$KillOccupiedPorts = Get-EnvValue "KILL_OCCUPIED_PORTS" "1"

Write-Host ""
Write-Host "======================================="
Write-Host "      EliteMek Backend API Starter"
Write-Host "======================================="
Write-Host "Project:  $Root"
Write-Host "Database: $DatabaseUrl"
Write-Host "Port:     $BackendPort"
Write-Host ""

[string[]]$pnpmCmd = Resolve-Pnpm

if (!(Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing workspace dependencies..."
  Invoke-Checked ($pnpmCmd + @("install"))
}

if ($RunSchemaPush -eq "1") {
  Write-Host "Updating database schema..."
  Invoke-Checked ($pnpmCmd + @("--filter", "@workspace/db", "push"))
} else {
  Write-Host "Skipping schema push."
}

if ($EnsureAdminLogin -eq "1") {
  Write-Host "Ensuring admin login exists..."
  $env:DATABASE_URL = $DatabaseUrl
  Invoke-Checked @("node", "scripts\repair-admin-login.cjs")
}

if ($KillOccupiedPorts -eq "1") {
  Stop-Port $BackendPort
}

Write-Host "Starting backend API..."
$env:DATABASE_URL = $DatabaseUrl
$env:PORT = "$BackendPort"
$env:NODE_ENV = "development"
Set-Location (Join-Path $Root "backend")
if ($pnpmCmd.Count -gt 1) {
  & $pnpmCmd[0] $pnpmCmd[1..($pnpmCmd.Count - 1)] dev
} else {
  & $pnpmCmd[0] dev
}
