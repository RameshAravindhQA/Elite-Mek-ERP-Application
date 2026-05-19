# 🚀 Quick Deployment Reference

## 1. Install Vercel CLI
```bash
npm install -g vercel
```

## 2. Link Project
```bash
vercel link
```

## 3. Set Environment in Vercel Dashboard
- Go to: https://vercel.com/dashboard
- Select: `ramesharavindhqa-elite-mek-erp-system-backend`
- Settings → Environment Variables → Add New
- **DATABASE_URL** = `postgresql://postgres.czbjiixzbbwbbhplvdur:Admin%40elitemek@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
- Environments: ✓ Production, ✓ Preview, ✓ Development
- Save and Deploy

## 4. Deploy to Vercel

### PowerShell (Recommended)
```powershell
.\Deploy-Vercel.ps1
```

### Batch
```bash
deploy-to-vercel.bat
```

### Manual
```bash
vercel --prod
```

## 5. Verify Deployment
```bash
curl https://ramesharavindhqa-elite-mek-erp-system-backend.vercel.app/api/healthz
```

Expected response: ✅ `{"status":"ok"}`

---

## 📚 Full Guides
- [Complete Deployment Guide](COMPLETE-DEPLOYMENT-GUIDE.md)
- [Environment Setup](VERCEL-ENV-SETUP.md)
- [Supabase Setup](SUPABASE-VERCEL-DEPLOYMENT.md)
- [Deployment Summary](DEPLOYMENT-SUMMARY.md)

## ✅ Status
- ✅ Database: Supabase PostgreSQL configured
- ✅ Connection: Tested and working
- ✅ Builds: Backend & Vercel builds successful
- ✅ Scripts: Deployment automation ready
- 🟡 Deploy: Ready for deployment

---

**Time to Deploy**: ~5 minutes
**Project**: Elite-Mek ERP System
