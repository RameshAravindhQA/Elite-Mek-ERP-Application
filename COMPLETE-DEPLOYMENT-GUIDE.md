# Complete Deployment Guide: Supabase + Vercel

## Prerequisites Checklist

- [x] Supabase PostgreSQL database created
- [x] Supabase connection string: `postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
- [ ] Vercel account created
- [ ] Vercel project linked to GitHub repository
- [ ] Vercel CLI installed locally

## Installation Steps

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

Verify installation:
```bash
vercel --version
```

### Step 2: Link Project to Vercel

From the project root directory:

```bash
vercel link
```

Follow the prompts:
- Scope: Your account
- Project name: Can keep as `ramesharavindhqa-elite-mek-erp-system-backend`
- Link to existing project: Choose if already created in Vercel dashboard

### Step 3: Set Environment Variables in Vercel

**Option A: Via CLI**
```bash
vercel env add DATABASE_URL
# Paste: postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require
# Select environments: all (production, preview, development)
```

**Option B: Via Vercel Dashboard**
1. Open [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Click "Add New"
5. Name: `DATABASE_URL`
6. Value: `postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
7. Select all environments
8. Click "Save"

### Step 4: Deploy to Vercel

**Option A: Using Deployment Script (Easiest)**

```bash
# Windows Batch
deploy-to-vercel.bat

# Windows PowerShell
.\Deploy-Vercel.ps1
```

**Option B: Using Vercel CLI**

```bash
# From project root
vercel --prod
```

**Option C: GitHub Auto-Deploy**
1. Push to main branch
2. Vercel automatically builds and deploys

### Step 5: Verify Deployment

Check the Vercel dashboard for successful deployment.

Test the API:
```bash
curl https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
```

## Post-Deployment Steps

### 1. Initialize Database (If Needed)

If you need to seed initial data:

```bash
# Set environment variable first
$env:DATABASE_URL = "postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"

# Run schema push
pnpm --filter @workspace/db run push

# Optionally seed data
pnpm --filter scripts run seed
```

### 2. Create Admin User

The system automatically creates `admin@elitemek.com` with password `admin123` on first run if `ENSURE_ADMIN_LOGIN=1`.

### 3. Test All Endpoints

```bash
# Health check
curl https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz

# Login
curl -X POST https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@elitemek.com","password":"admin123"}'
```

## Environment Variables Reference

| Variable | Value | Required | Environment |
|----------|-------|----------|-------------|
| `DATABASE_URL` | `postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require` | Yes | All |
| `NODE_ENV` | `production` | No | Production |
| `LOG_LEVEL` | `info` | No | All |

## Troubleshooting

### Issue: "RTG Error" or Build Fails

**Solution:**
1. Check Node.js version on Vercel (should be 22.x)
2. Verify DATABASE_URL is correctly set
3. Check build logs: `vercel logs <deployment-id>`
4. Redeploy: `vercel --prod --force`

### Issue: Database Connection Timeout

**Solution:**
1. Verify Supabase database is running
2. Check connection string format (passwords with special characters must be URL-encoded)
3. Verify SSL mode: `?sslmode=require` is present
4. Test locally first: 
   ```bash
   pnpm --filter @workspace/db run push
   ```

### Issue: 502 Bad Gateway

**Solution:**
1. Check Vercel function logs
2. Verify DATABASE_URL environment variable is set
3. Check Supabase database connectivity
4. Look for timeout issues in connection pool

### Issue: Build Succeeds but Deployment Fails

**Solution:**
1. Clear Vercel cache: `vercel env pull`
2. Rebuild: `vercel --prod --force`
3. Check for missing environment variables in Vercel dashboard

## Rolling Back

If deployment fails:

```bash
vercel rollback
```

Or select a previous deployment from Vercel dashboard.

## Monitoring

### Check Deployment Status
```bash
vercel list
```

### View Real-time Logs
```bash
vercel logs --follow
```

### Check Function Metrics
Visit: https://vercel.com/[project]/monitoring/functions

## Performance Tips

1. **Connection Pooling**: Supabase connection pooler is enabled
2. **Timeouts**: Default 60 seconds for serverless functions
3. **Memory**: 1024 MB allocated per function
4. **Cold Starts**: Warm up with periodic health checks

## Next Steps

After deployment:

1. Update frontend API endpoint to point to deployed backend
2. Configure CORS for frontend domain
3. Set up monitoring and alerts
4. Configure backup strategy for Supabase

---

**Project**: Elite-Mek ERP System
**Backend URL**: https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api
**Date**: May 20, 2026
**Status**: ✅ Ready for Production Deployment
