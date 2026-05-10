# EliteMek ERP System - Local Setup Guide

## Prerequisites
- Node.js 20+
- pnpm (`npm i -g pnpm`)
- PostgreSQL (local: port 5432, DB `postgres`, user/pass `postgres`)

## Installation
1. Clone/download project.
2. Open terminal in root (`c:/Users/USER/Downloads/LocalHelper`).
3. `pnpm install`

## Database Setup
1. Start Postgres local.
2. Set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres` (or your creds).
3. Run migrations: `pnpm --filter lib/db build` (generates schema).
4. Seed dummy data: `pnpm --filter scripts run seed` (30 records/module + images).

## Launch
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

To reset demo data intentionally, edit `start.bat` and set:
```
set "SEED_DATABASE=1"
```

## Usage
- Login: `admin@elitemek.com` / any pass (demo).
- Settings: Theme colors, fonts save to DB.
- Import/Export: CSV templates per module.

## Stop
Ctrl+C each terminal or `taskkill /f /im node.exe`

## Troubleshoot
- tsconfig errors: Fixed for local.
- DB connect: Check Postgres running, correct URL.
- Blank page: Restart with env vars.

Brand: Engineering in Excellence
