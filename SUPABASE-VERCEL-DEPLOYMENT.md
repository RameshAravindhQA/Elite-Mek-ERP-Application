# Supabase + Vercel Deployment Guide

## Prerequisites
- Supabase account with PostgreSQL database
- Vercel account connected to GitHub repository
- Node.js 20+ locally (for testing)
- pnpm installed

## Step 1: Supabase Setup (Completed)
✅ Database created at: `aws-1-ap-northeast-2.pooler.supabase.com`
✅ Connection string configured with SSL mode

### Connection Details
- Host: aws-1-ap-northeast-2.pooler.supabase.com
- Database: postgres
- User: postgres.czbjiixzbbwbbhplvdur
- Port: 5432
- SSL Mode: require (required for Supabase)

## Step 2: Local Testing with Supabase

### Test Database Connection
```bash
# Run database schema push
pnpm --filter lib/db run build

# This will create all tables in Supabase
```

### Start Backend Locally
```bash
# From root directory
set "DATABASE_URL=postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
pnpm --filter backend run dev
```

## Step 3: Vercel Environment Variables

Go to Vercel project settings and add:

```
DATABASE_URL=postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require
NODE_ENV=production
```

**IMPORTANT**: The password contains `@` which must be URL-encoded as `%40` in the connection string.

## Step 4: Vercel Configuration

Your `vercel.json` is configured correctly:
```json
{
  "version": 2,
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build:vercel",
  "outputDirectory": ".vercel/output"
}
```

## Step 5: Build Verification

### Local Build Test
```bash
pnpm run build:vercel
```

This builds the backend and creates Vercel serverless function package.

## Step 6: Deploy to Vercel

### Option A: Via Vercel CLI
```bash
npm install -g vercel
vercel --prod
```

### Option B: Via GitHub Push
Push to main branch - Vercel auto-deploys if connected

### Option C: Via Vercel Dashboard
1. Go to your Vercel project
2. Click "Deploy"
3. Ensure environment variables are set
4. Deploy

## Vercel: Migrate and Seed
- Vercel build itself does not automatically run database seed scripts.
- Use the repo deployment script to migrate before deployment:
  - `Deploy-Vercel.ps1` or `deploy-to-vercel.bat`
  - These scripts already run `pnpm --filter @workspace/db run push` before building.
- To seed the production Supabase database, run locally after deployment using the production `DATABASE_URL`:
  - `pnpm --filter ./scripts run seed`
  - or `pnpm --filter ./scripts run seed:purchase-orders` for purchase-order only seed.
- Do not seed on every automatic Vercel deployment unless you want demo/sample data reset.

## Monitoring Deployment

### Check Vercel Build Logs
```
https://vercel.com/[username]/ramesharavindhqa-elite-mek-erp-system-backend/deployments
```

### Test Deployed Backend
```
GET https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-20T..."
}
```

## Common Issues & Solutions

### Issue: "RTG Error" or Build Failures
- Check Node version is 20+
- Verify all environment variables in Vercel
- Check database connection string has `%40` for `@`

### Issue: Database Connection Timeout
- Verify Supabase project is running
- Check IP whitelist (Supabase should allow all IPs)
- Ensure sslmode=require in connection string

### Issue: Memory Exceeded
- Supabase connection pooling handles this
- Verify vercel.json buildCommand is correct

## Rollback

If deployment fails:
```bash
vercel rollback
```

Or deploy previous version from Vercel dashboard.

## Success Indicators

✅ Build completes without errors
✅ Serverless functions created in `.vercel/output/functions/`
✅ Health check endpoint responds
✅ Database operations work (check logs)

---
Date: May 20, 2026
Project: Elite-Mek ERP System
