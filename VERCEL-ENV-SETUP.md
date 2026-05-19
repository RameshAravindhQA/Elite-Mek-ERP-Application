# Vercel Environment Variables Setup

## Step 1: Access Your Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Find your project: `ramesharavindhqa-elite-mek-erp-system-backend`
3. Click on the project name
4. Go to **Settings** → **Environment Variables**

## Step 2: Add Environment Variables

Click "Add New" and configure each variable:

### Critical: DATABASE_URL
- **Name**: `DATABASE_URL`
- **Value**: `postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
- **Environments**: 
  - ✓ Production
  - ✓ Preview
  - ✓ Development

### NODE_ENV (Optional but Recommended)
- **Name**: `NODE_ENV`
- **Value**: `production`
- **Environments**:
  - ✓ Production

### Any Other Variables You Need
- `LOG_LEVEL` (optional): `info`
- `MAX_REQUEST_SIZE` (optional): `15mb`

## Step 3: Redeploy After Adding Variables

After adding environment variables:

1. Go to **Deployments** tab
2. Click the latest deployment
3. Click **Redeploy** button
4. Select **Use existing Environment Variables**
5. Click **Redeploy**

Or use CLI:
```bash
vercel --prod --force
```

## Step 4: Verify Deployment

Test the health endpoint:
```bash
curl https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-05-20T..."
}
```

## Important Notes

⚠️ **Password Encoding**: The password `Admin@elitemek` is URL-encoded as `Admin%40elitemek` in the connection string because `@` is a special character in URLs.

✅ **SSL Mode**: `sslmode=require` is required for Supabase and included in the connection string.

✅ **Connection Pooling**: The URL uses Supabase's connection pooler for serverless compatibility.

## Troubleshooting

### Deployment Shows "RTG Error"
- This is often a memory issue or timeout
- Check Database URL environment variable
- Verify the URL is exactly as shown above

### Health Check Fails
```bash
curl -v https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
```
- Check server logs in Vercel dashboard
- Verify DATABASE_URL is set in Vercel environment

### Build Fails
1. Check Vercel build logs
2. Ensure `pnpm run build:vercel` works locally
3. Verify Node.js version (should be 22.x on Vercel)

## Quick Checklist

- [ ] Vercel project created
- [ ] DATABASE_URL environment variable added
- [ ] Variable set for all environments (Production, Preview)
- [ ] Redeployed after adding variables
- [ ] Health check endpoint responds
- [ ] Can query database (check API logs)

---

**Last Updated**: May 20, 2026
**Status**: Ready for Production
