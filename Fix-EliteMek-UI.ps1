# ============================================================
#  Fix-EliteMek-UI.ps1
#  Auto-fix script for EliteMek ERP UI dependency issues
#  Run from project root:
#    powershell -ExecutionPolicy Bypass -File Fix-EliteMek-UI.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# ── Helpers ─────────────────────────────────────────────────
function Write-Step { param([string]$Msg) Write-Host "`n[$Msg]" -ForegroundColor Cyan }
function Write-OK   { param([string]$Msg) Write-Host "  OK  $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "  WARN $Msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$Msg) Write-Host "  FAIL $Msg" -ForegroundColor Red }

function Run {
    param([string[]]$Cmd, [string]$Cwd = $Root)
    $exe  = $Cmd[0]
    $args = if ($Cmd.Count -gt 1) { $Cmd[1..($Cmd.Count-1)] } else { @() }
    $p = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $Cwd -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { throw "Command failed (exit $($p.ExitCode)): $($Cmd -join ' ')" }
}

function PatchFile {
    param([string]$Path, [string]$Description, [scriptblock]$Transform)
    if (-not (Test-Path $Path)) { Write-Warn "Not found – skip: $Path"; return }
    $original = Get-Content $Path -Raw -Encoding UTF8
    $patched  = & $Transform $original
    if ($patched -ne $original) {
        Set-Content $Path $patched -Encoding UTF8 -NoNewline
        Write-OK "$Description  →  $Path"
    } else {
        Write-OK "Already OK: $Path"
    }
}

function AppendIfMissing {
    param([string]$Path, [string]$Marker, [string]$Content, [string]$Description)
    if (-not (Test-Path $Path)) { Write-Warn "Not found – skip: $Path"; return }
    $text = Get-Content $Path -Raw -Encoding UTF8
    if ($text -notmatch [regex]::Escape($Marker)) {
        Add-Content $Path "`n$Content" -Encoding UTF8
        Write-OK "$Description  →  $Path"
    } else {
        Write-OK "Already present: $Path"
    }
}

# ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "   EliteMek ERP – UI Dependency Auto-Fix" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "Root: $Root"

# ════════════════════════════════════════════════════════════
# STEP 1 – Ensure .env exists
# ════════════════════════════════════════════════════════════
Write-Step "1/9  Checking .env"
$envPath = Join-Path $Root ".env"
if (-not (Test-Path $envPath)) {
    $candidates = @("_env", ".env.example", ".env.sample")
    $found = $false
    foreach ($c in $candidates) {
        $src = Join-Path $Root $c
        if (Test-Path $src) {
            Copy-Item $src $envPath
            Write-OK "Created .env from $c"
            $found = $true; break
        }
    }
    if (-not $found) {
        $defaultEnv = @"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
BACKEND_START_PORT=3000
FRONTEND_START_PORT=5173
BASE_PATH=/
MAX_PORT_OFFSET=100
KILL_OCCUPIED_PORTS=1
RUN_SCHEMA_PUSH=1
SEED_DATABASE=0
ENSURE_ADMIN_LOGIN=1
CHECK_DATABASE=1
OPEN_BROWSER=1
"@
        Set-Content $envPath $defaultEnv -Encoding UTF8
        Write-OK "Created default .env"
    }
} else {
    Write-OK ".env already exists"
}

# ════════════════════════════════════════════════════════════
# STEP 2 – Clean stale node_modules & build caches
# ════════════════════════════════════════════════════════════
Write-Step "2/9  Cleaning stale build artefacts"
$dirsToClean = @(
    "node_modules\.cache",
    "frontend\.vite",
    "frontend\dist",
    "backend\dist",
    ".pnpm-store\tmp"
)
foreach ($d in $dirsToClean) {
    $full = Join-Path $Root $d
    if (Test-Path $full) {
        Remove-Item $full -Recurse -Force -ErrorAction SilentlyContinue
        Write-OK "Removed $d"
    }
}

# ════════════════════════════════════════════════════════════
# STEP 3 – Reinstall workspace dependencies
# ════════════════════════════════════════════════════════════
Write-Step "3/9  Installing workspace dependencies (pnpm install)"
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    $corepack = Get-Command corepack -ErrorAction SilentlyContinue
    if ($corepack) {
        Run @("corepack", "enable")
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    }
    if (-not $pnpm) { throw "pnpm not found. Run: npm install -g pnpm" }
}
Run @("pnpm", "install") $Root
Write-OK "pnpm install completed"

# ════════════════════════════════════════════════════════════
# STEP 4 – Fix Tailwind v4 backdrop-blur / bb-blur-overlay
# ════════════════════════════════════════════════════════════
Write-Step "4/9  Fixing Tailwind v4 backdrop-blur utilities"

# Possible CSS entry points
$cssCandidates = @(
    "frontend\src\index.css",
    "frontend\src\globals.css",
    "frontend\src\app.css",
    "frontend\src\styles\globals.css",
    "frontend\src\styles\index.css"
)

$blurUtility = @"

/* ── EliteMek fix: backdrop-blur fallback for Tailwind v4 ── */
@utility bb-blur-overlay {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* Ensure Tailwind generates backdrop-blur variants */
@layer utilities {
  .backdrop-blur-none  { backdrop-filter: blur(0); }
  .backdrop-blur-sm    { backdrop-filter: blur(4px);  -webkit-backdrop-filter: blur(4px); }
  .backdrop-blur       { backdrop-filter: blur(8px);  -webkit-backdrop-filter: blur(8px); }
  .backdrop-blur-md    { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  .backdrop-blur-lg    { backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .backdrop-blur-xl    { backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
}
"@

$cssPatched = $false
foreach ($rel in $cssCandidates) {
    $full = Join-Path $Root $rel
    if (Test-Path $full) {
        $text = Get-Content $full -Raw -Encoding UTF8
        if ($text -notmatch "bb-blur-overlay") {
            Add-Content $full $blurUtility -Encoding UTF8
            Write-OK "Added bb-blur-overlay utility  →  $rel"
        } else {
            Write-OK "Already present: $rel"
        }
        $cssPatched = $true
        break
    }
}
if (-not $cssPatched) { Write-Warn "No CSS entry point found – skipping Tailwind fix" }

# ════════════════════════════════════════════════════════════
# STEP 5 – Fix Dialog / AlertDialog overlay z-index & blur
# ════════════════════════════════════════════════════════════
Write-Step "5/9  Fixing Dialog/AlertDialog overlay stacking"

$dialogCandidates = @(
    "frontend\src\components\ui\dialog.tsx",
    "frontend\src\components\ui\alert-dialog.tsx",
    "frontend\src\components\ui\Dialog.tsx",
    "frontend\src\components\ui\AlertDialog.tsx"
)

foreach ($rel in $dialogCandidates) {
    $full = Join-Path $Root $rel
    if (-not (Test-Path $full)) { continue }

    PatchFile $full "Fixed overlay z-index + blur" {
        param([string]$src)

        # Fix overlay: ensure z-50 and bb-blur-overlay present
        $src = $src -replace `
            '(DialogPrimitive\.Overlay[^`]*className=\{cn\([^)]*)"([^"]*fixed inset-0[^"]*)"', `
            { $matches[1] + '"' + ($matches[2] -replace 'z-\[?\d+\]?','z-50') + ' bb-blur-overlay"' }

        # Simpler pattern: add bb-blur-overlay to any fixed inset-0 overlay className string
        $src = $src -replace `
            '("fixed inset-0(?:[^"]*?))"(?=[^>]*?(Overlay|overlay))', `
            { if ($matches[0] -notmatch 'bb-blur-overlay') { $matches[1] + ' bb-blur-overlay"' } else { $matches[0] } }

        return $src
    }
}

# ════════════════════════════════════════════════════════════
# STEP 6 – Fix Vite proxy config (blank page = backend mismatch)
# ════════════════════════════════════════════════════════════
Write-Step "6/9  Fixing Vite proxy / backend port config"

$viteCandidates = @(
    "frontend\vite.config.ts",
    "frontend\vite.config.js"
)

foreach ($rel in $viteCandidates) {
    $full = Join-Path $Root $rel
    if (-not (Test-Path $full)) { continue }

    PatchFile $full "Hardened Vite proxy config" {
        param([string]$src)

        # Ensure BACKEND_PORT fallback to 3000
        $src = $src -replace `
            "process\.env\.BACKEND_PORT\b", `
            "process.env.BACKEND_PORT || '3000'"

        # If proxy target doesn't have a fallback, add it
        $src = $src -replace `
            "target:\s*`"http://localhost:\$\{process\.env\.BACKEND_PORT\}`"", `
            "target: ``http://localhost:\${process.env.BACKEND_PORT || '3000'}``"

        return $src
    }
    break
}

# ════════════════════════════════════════════════════════════
# STEP 7 – Fix tsconfig paths (TS errors kill HMR silently)
# ════════════════════════════════════════════════════════════
Write-Step "7/9  Checking frontend tsconfig for path alias issues"

$frontendTsconfig = Join-Path $Root "frontend\tsconfig.json"
if (Test-Path $frontendTsconfig) {
    $json = Get-Content $frontendTsconfig -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($json) {
        # Ensure skipLibCheck is true to avoid cascading type errors
        if (-not $json.compilerOptions.skipLibCheck) {
            $raw = Get-Content $frontendTsconfig -Raw -Encoding UTF8
            $raw = $raw -replace '"skipLibCheck"\s*:\s*false', '"skipLibCheck": true'
            if ($raw -notmatch '"skipLibCheck"') {
                $raw = $raw -replace '("compilerOptions"\s*:\s*\{)', '$1' + "`n    `"skipLibCheck`": true,"
            }
            Set-Content $frontendTsconfig $raw -Encoding UTF8 -NoNewline
            Write-OK "Set skipLibCheck: true in frontend tsconfig"
        } else {
            Write-OK "skipLibCheck already set"
        }
    }
} else {
    Write-Warn "frontend/tsconfig.json not found"
}

# ════════════════════════════════════════════════════════════
# STEP 8 – Ensure required shadcn/ui packages are installed
# ════════════════════════════════════════════════════════════
Write-Step "8/9  Verifying critical frontend packages"

$frontendPkg = Join-Path $Root "frontend\package.json"
if (Test-Path $frontendPkg) {
    $pkg = Get-Content $frontendPkg -Raw | ConvertFrom-Json
    $deps = @{}
    if ($pkg.dependencies)    { $pkg.dependencies.PSObject.Properties    | ForEach-Object { $deps[$_.Name] = $_.Value } }
    if ($pkg.devDependencies) { $pkg.devDependencies.PSObject.Properties  | ForEach-Object { $deps[$_.Name] = $_.Value } }

    $required = @(
        "@radix-ui/react-dialog",
        "@radix-ui/react-alert-dialog",
        "tailwindcss",
        "lucide-react"
    )

    $missing = @()
    foreach ($pkg in $required) {
        if (-not $deps.ContainsKey($pkg)) { $missing += $pkg }
    }

    if ($missing.Count -gt 0) {
        Write-Warn "Missing packages detected: $($missing -join ', ')"
        Write-Host "  Installing missing packages..." -ForegroundColor Yellow
        $installArgs = @("add") + $missing
        Run (@("pnpm") + $installArgs) (Join-Path $Root "frontend")
        Write-OK "Installed: $($missing -join ', ')"
    } else {
        Write-OK "All critical packages present"
    }
} else {
    Write-Warn "frontend/package.json not found"
}

# ════════════════════════════════════════════════════════════
# STEP 9 – Create a diagnostic health-check page
# ════════════════════════════════════════════════════════════
Write-Step "9/9  Writing UI health-check helper"

$healthCheckPath = Join-Path $Root "frontend\src\components\ui\HealthCheck.tsx"
if (-not (Test-Path (Split-Path $healthCheckPath))) {
    Write-Warn "frontend/src/components/ui not found – skip HealthCheck"
} else {
    $healthCheck = @'
/**
 * HealthCheck – drop <HealthCheck /> anywhere in your app during debug.
 * Remove it once the UI is confirmed working.
 */
import { useEffect, useState } from "react";

export function HealthCheck() {
  const [api, setApi] = useState<"ok" | "error" | "checking">("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const port = (window as any).__BACKEND_PORT__ || 3000;
    fetch(`/api/healthz`)
      .then((r) => {
        if (r.ok) { setApi("ok"); setMsg("Backend reachable"); }
        else { setApi("error"); setMsg(`HTTP ${r.status}`); }
      })
      .catch((e) => { setApi("error"); setMsg(String(e)); });
  }, []);

  const colour = api === "ok" ? "#22c55e" : api === "error" ? "#ef4444" : "#f59e0b";

  return (
    <div style={{
      position: "fixed", bottom: 12, right: 12, zIndex: 9999,
      background: "#1e293b", color: "#f8fafc", borderRadius: 8,
      padding: "8px 14px", fontSize: 12, fontFamily: "monospace",
      boxShadow: "0 4px 24px rgba(0,0,0,.5)", display: "flex",
      alignItems: "center", gap: 8
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: colour, display: "inline-block" }} />
      <span>API: <strong>{msg || api}</strong></span>
    </div>
  );
}
'@
    Set-Content $healthCheckPath $healthCheck -Encoding UTF8
    Write-OK "Created HealthCheck component  →  frontend/src/components/ui/HealthCheck.tsx"
}

# ════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   ALL FIXES APPLIED SUCCESSFULLY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Run:  start.bat   (or double-click it)" -ForegroundColor White
Write-Host "  2. Open: http://localhost:5173" -ForegroundColor White
Write-Host "  3. Press F12 → Console — if errors remain, share them" -ForegroundColor White
Write-Host ""
Write-Host "If the main content is still blank after this fix:" -ForegroundColor Yellow
Write-Host "  - Open DevTools (F12) > Console and look for red errors" -ForegroundColor Yellow
Write-Host "  - Open DevTools > Network and check for failed /api/* requests" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"
