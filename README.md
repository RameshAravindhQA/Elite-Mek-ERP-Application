# EliteMek ERP System - Local Setup Guide

## Prerequisites
- Node.js 20+
- pnpm (`npm i -g pnpm`)
- PostgreSQL (local: port 5432, DB `postgres`, user/pass `postgres`)
- OR Supabase PostgreSQL (for cloud deployment)

## Installation
1. Clone/download project.
2. Open terminal in root (`c:/Users/USER/Downloads/LocalHelper`).
3. `pnpm install`

## Database Setup

### Local PostgreSQL (Development)
1. Start Postgres locally.
2. Set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres` (or your creds).
3. Run migrations: `pnpm migrate` (generates schema).
4. Seed dummy data: `pnpm seed` (30 records/module + images).

Additional repo-level commands:
- `pnpm migrate:force` — force push DB schema changes.
- `pnpm seed:po` — seed only purchase orders.

### Supabase PostgreSQL (Production/Cloud)
1. Create Supabase project at https://supabase.com
2. Get connection string from Settings → Database
3. Set `DATABASE_URL` in `.env.production`
4. See [SUPABASE-VERCEL-DEPLOYMENT.md](SUPABASE-VERCEL-DEPLOYMENT.md) for detailed setup

## Launch

### Local Development
**Windows one-click startup:**
Double-click `start.bat` from the project root.

The launcher:
- finds free backend/frontend ports automatically when the preferred ports are already busy;
- starts backend and frontend in separate windows;
- runs schema push by default;
- does not seed by default, because seeding resets sample-data tables.

Default URLs:
- Backend: http://localhost:3000/api, or the next free port shown in the launcher.
- Frontend: http://localhost:5173, or the next free port shown in the launcher.

### Production Deployment
For Vercel deployment with Supabase:
```bash
.\Deploy-Vercel.ps1
# or
deploy-to-vercel.bat
```

Note: if your Vercel backend is configured with folder `backend`, that project will use `backend/vercel.json` and the command:
```bash
pnpm run build:vercel
```

If the frontend is deployed separately, the frontend project should build from `frontend` and use:
```bash
pnpm --filter ./frontend run build
```

#### GitHub commit author blocker
If Vercel shows "commit email could not be matched to a Git account", fix it by committing directly from GitHub web UI or by updating your local Git config with your GitHub email. A GitHub web commit is the simplest fix and allows Vercel to recognize the author.

See `SUPABASE-VERCEL-DEPLOYMENT.md` for more details.

See [COMPLETE-DEPLOYMENT-GUIDE.md](COMPLETE-DEPLOYMENT-GUIDE.md) for full instructions.

## Usage
- Login: `admin@elitemek.com` / `admin123` (demo).
- Settings: Theme colors, fonts save to DB.
- Import/Export: CSV templates per module.

## Environment Variables

### Local Development (.env)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
BACKEND_START_PORT=3000
FRONTEND_START_PORT=5173
```

### Production (.env.production)
```
DATABASE_URL=postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require
NODE_ENV=production
```

## Deployment Guides

- 📚 [Local Setup](README.md) - This file
- ☁️ [Supabase + Vercel Setup](SUPABASE-VERCEL-DEPLOYMENT.md)
- 🚀 [Complete Deployment Guide](COMPLETE-DEPLOYMENT-GUIDE.md)
- ⚙️ [Vercel Environment Variables](VERCEL-ENV-SETUP.md)
- 🔧 [Backend-Only Setup](DEPLOYMENT-BACKEND-WINDOWS.md)
- 🖥️ [Full Windows Deployment](DEPLOYMENT-WINDOWS.md)

## Stop
Ctrl+C each terminal or `taskkill /f /im node.exe`

## Troubleshoot
- tsconfig errors: Fixed for local.
- DB connect: Check Postgres running, correct URL.
- Blank page: Restart with env vars.
- Supabase connection failed: Verify password encoding (`@` → `%40`) and `sslmode=require`.
- Vercel deployment fails: Check environment variables in Vercel dashboard.

Brand: Engineering in Excellence
