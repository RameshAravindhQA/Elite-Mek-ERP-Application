$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Load-EnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $parts = $line.Split("=", 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($key -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Get-EnvValue {
  param([string]$Name, [string]$Default)
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
  return $value
}

function Require-Command {
  param([string]$Name, [string]$Message)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw $Message
  }
  Write-Host "$Name found."
}

function Resolve-Pnpm {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    Write-Host "pnpm found."
    return @($pnpm.Source)
  }
  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    Write-Host "pnpm was not found directly. Using Corepack pnpm."
    return @($corepack.Source, "pnpm")
  }
  throw "pnpm is required. Install it with: npm install -g pnpm or enable Corepack: corepack enable"
}

function Invoke-Checked {
  param([string[]]$Command, [string]$WorkingDirectory = $Root)
  $exe = $Command[0]
  $args = @()
  if ($Command.Count -gt 1) { $args = $Command[1..($Command.Count - 1)] }
  $process = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $WorkingDirectory -Wait -PassThru -NoNewWindow
  if ($process.ExitCode -ne 0) {
    throw "Command failed: $($Command -join ' ')"
  }
}

function Test-PortFree {
  param([int]$Port)
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try { $listener.Stop() } catch {}
  }
}

function Stop-Port {
  param([int]$Port)
  if ($KillOccupiedPorts -ne "1") { return }
  $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 250
}

function Find-FreePort {
  param([int]$StartPort)
  for ($port = $StartPort; $port -le ($StartPort + $MaxPortOffset); $port++) {
    if (Test-PortFree $port) { return $port }
    Stop-Port $port
    if (Test-PortFree $port) { return $port }
  }
  throw "Could not find a free port."
}

function Wait-Http {
  param([string]$Url, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-CmdWindow {
  param([string]$Title, [string]$WorkingDirectory, [hashtable]$Environment, [string]$Command)
  $sets = @()
  foreach ($key in $Environment.Keys) {
    $sets += "set $key=$($Environment[$key])"
  }
  $fullCommand = (($sets + @($Command)) -join " && ")
  Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title $Title && cd /d `"$WorkingDirectory`" && $fullCommand"
}

try {
  Load-EnvFile (Join-Path $Root ".env")

  $DatabaseUrl = Get-EnvValue "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/postgres"
  $BackendStartPort = [int](Get-EnvValue "BACKEND_START_PORT" "3000")
  $FrontendStartPort = [int](Get-EnvValue "FRONTEND_START_PORT" "5173")
  $BasePath = Get-EnvValue "BASE_PATH" "/"
  $MaxPortOffset = [int](Get-EnvValue "MAX_PORT_OFFSET" "100")
  $KillOccupiedPorts = Get-EnvValue "KILL_OCCUPIED_PORTS" "1"
  $RunSchemaPush = Get-EnvValue "RUN_SCHEMA_PUSH" "1"
  $SeedDatabase = Get-EnvValue "SEED_DATABASE" "0"
  $CheckDatabase = Get-EnvValue "CHECK_DATABASE" "1"
  $OpenBrowser = Get-EnvValue "OPEN_BROWSER" "1"

  Write-Host ""
  Write-Host "======================================="
  Write-Host "       EliteMek ERP Local Starter"
  Write-Host "======================================="
  Write-Host "Project: $Root"
  Write-Host ""

  Require-Command "node" "Node.js 20+ is required. Install Node.js and run start.bat again."
  $nodeVersion = (& node -p "process.versions.node").Trim()
  if ([int]($nodeVersion.Split(".")[0]) -lt 20) { throw "Node.js 20+ is required. Current version: $nodeVersion" }
  Write-Host "Node.js version $nodeVersion is OK."

  $pnpmCmd = Resolve-Pnpm

  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "Dependencies are missing. Running pnpm install..."
    Invoke-Checked ($pnpmCmd + @("install"))
  } else {
    Write-Host "Dependencies found."
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $Root "logs") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $Root "backend\uploads") | Out-Null

  if ($CheckDatabase -eq "1") {
    $uri = [Uri]$DatabaseUrl
    $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    Write-Host "Checking database connection to $($uri.Host):$dbPort..."
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try {
      $connect = $tcp.BeginConnect($uri.Host, $dbPort, $null, $null)
      if (-not $connect.AsyncWaitHandle.WaitOne(3000)) { throw "Connection timed out" }
      $tcp.EndConnect($connect)
      Write-Host "PostgreSQL is reachable."
    } finally {
      $tcp.Close()
    }
  } else {
    Write-Host "Skipping database reachability check."
  }

  $backendPort = Find-FreePort $BackendStartPort
  $frontendPort = Find-FreePort $FrontendStartPort

  if ($RunSchemaPush -eq "1") {
    Write-Host "[1/4] Updating database schema..."
    Invoke-Checked ($pnpmCmd + @("--filter", "@workspace/db", "push"))
  } else {
    Write-Host "[1/4] Skipping database schema update."
  }

  if ($SeedDatabase -eq "1") {
    Write-Host "[2/4] Seeding database..."
    Invoke-Checked ($pnpmCmd + @("--filter", "@workspace/scripts", "run", "seed"))
  } else {
    Write-Host "[2/4] Skipping seed. Set SEED_DATABASE=1 only when you want demo data reset."
  }

  Write-Host "[3/4] Starting backend API..."
  Start-CmdWindow "EliteMek Backend API - $backendPort" (Join-Path $Root "backend") @{
    DATABASE_URL = $DatabaseUrl
    PORT = "$backendPort"
    NODE_ENV = "development"
  } "pnpm dev"

  if (-not (Wait-Http "http://localhost:$backendPort/api/healthz" 90)) {
    throw "Backend did not become healthy in time. Check the backend window."
  }

  Write-Host "[4/4] Starting frontend dashboard..."
  Start-CmdWindow "EliteMek Frontend - $frontendPort" (Join-Path $Root "frontend") @{
    PORT = "$frontendPort"
    BASE_PATH = $BasePath
    BACKEND_PORT = "$backendPort"
  } "pnpm dev"

  if (-not (Wait-Http "http://localhost:$frontendPort" 60)) {
    Write-Host "WARNING: Frontend did not answer yet. Check the frontend window."
  }

  if ($OpenBrowser -eq "1") {
    Start-Process "http://localhost:$frontendPort"
  }

  Write-Host ""
  Write-Host "ERP System Launched"
  Write-Host "Backend:  http://localhost:$backendPort/api"
  Write-Host "Frontend: http://localhost:$frontendPort"
  Write-Host "Login:    admin@elitemek.com / admin123"
  Write-Host ""
  Read-Host "Press Enter to exit this launcher. Backend and frontend windows remain open"
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)"
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}
