# FPL Rules Checker - Deployment Guide

## Overview
This application can be deployed in two ways:

## 🚀 Option 1: Automated VPS Deployment (Recommended)
**Requirements:** GitHub repository + VPS with Node.js

### Automated Deployment with GitHub Actions:
```bash
# 1. Configure GitHub secrets (one-time setup)
# See VPS-DEPLOYMENT.md for complete guide

# 2. Deploy with one command
git push origin main
# Automatically deploys with PM2 + Nginx!
```

### Production server features:
- ✅ GitHub Actions CI/CD pipeline
- ✅ PM2 process management
- ✅ Nginx reverse proxy + SSL ready
- ✅ Zero-downtime deployments
- ✅ Automatic backups & rollback
- ✅ Full CORS handling & export functionality

See **[VPS-DEPLOYMENT.md](VPS-DEPLOYMENT.md)** for complete setup guide.

---

## 📱 Option 2: Static Deployment (GitHub Pages / Netlify)
**Limitations:** No server-side features, may have CORS issues

### Deploy to GitHub Pages:
```bash
# Build static version
npm run build:static

# Deploy (automated via GitHub Actions)
git add . && git commit -m "Deploy to GitHub Pages"
git push origin main
```

### Static deployment features:
- ⚠️ Limited by CORS policy
- ❌ No export functionality
- ✅ Analysis features work (when CORS allows)
- ✅ 100% Web Vitals scores

---

## 🔧 Environment Configuration

### For VPS (.env.production):
```bash
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FPL_API_BASE_URL=https://fantasy.premierleague.com
```

### For Static (config.js):
```javascript
baseUrl: "https://fantasy.premierleague.com/api"
```

---

## 📋 Pre-deployment Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Environment configured
- [ ] Web Vitals at 100% (run `npm run audit`)
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] All features tested

---

## 🎯 Recommended Setup: Automated VPS
For full functionality and professional deployment, use GitHub Actions with VPS deployment. This gives you enterprise-grade CI/CD with zero-downtime deployments.