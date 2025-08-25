# 🚀 Automated VPS Deployment with GitHub Actions

This guide shows how to set up automated deployment to your VPS using GitHub Actions, PM2, and optionally Nginx.

## 🛠️ Prerequisites

### On Your VPS:
- ✅ Ubuntu/Debian server with SSH access
- ✅ Node.js 18+ installed
- ✅ npm/yarn available
- ✅ (Optional) Nginx for reverse proxy
- ✅ Sudo access for the deployment user

### On GitHub:
- ✅ Repository with admin access
- ✅ VPS server details (IP, SSH key, etc.)

## 🔐 Step 1: Configure GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions

### Required Secrets:
```bash
VPS_HOST=your.server.ip.address
VPS_USERNAME=your-ssh-username  
VPS_SSH_KEY=your-private-ssh-key-content
```

### Optional Secrets:
```bash
VPS_SSH_PASSPHRASE=your-ssh-key-passphrase  # If your SSH key has a passphrase
VPS_SSH_PORT=22                             # If using non-standard SSH port
```

### Additional Deployment Secrets:
```bash
APP_DIR=/path/to/your/app              # Where to deploy the app
DOMAIN=yourdomain.com                  # Your domain
PORT=3001                              # Port for the Node.js app
```

## 🔑 Step 2: Generate SSH Key (if needed)

On your local machine:
```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "github-actions@fplchecker"

# Copy public key to your VPS
ssh-copy-id -i ~/.ssh/id_rsa.pub user@your.server.ip

# Copy private key content for GitHub secret
cat ~/.ssh/id_rsa
# Copy the entire content including -----BEGIN/END----- lines
```

## 🌐 Step 3: VPS Server Preparation

SSH into your VPS and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx (optional but recommended)
sudo apt install nginx -y

# Create deployment directory  
sudo mkdir -p /path/to/your/app
sudo chown $USER:$USER /path/to/your/app

# Setup PM2 startup script
pm2 startup
# Copy and run the command it shows you with sudo
```

## 🔥 Step 4: Configure Firewall

```bash
# Allow SSH, HTTP, and your app port
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp
sudo ufw enable
```

## 🚀 Step 5: Deploy!

### Automatic Deployment:
```bash
# Just push to main branch
git add .
git commit -m "feat: deploy to production"
git push origin main
# GitHub Actions automatically deploys to your VPS!
```

### Skip VPS Deployment:
```bash
# Skip VPS deployment but still deploy to GitHub Pages
git commit -m "docs: update README [skip-vps]"
git push origin main
```

## 📊 What the Workflow Does:

### 1. **Builds & Tests:**
- ✅ Installs dependencies
- ✅ Validates JavaScript files
- ✅ Creates production bundle

### 2. **Deploys to VPS:**
- ✅ Uploads code via SCP
- ✅ Installs production dependencies
- ✅ Configures environment variables
- ✅ Manages process with PM2

### 3. **Sets up Infrastructure:**
- ✅ Configures Nginx reverse proxy
- ✅ Sets up SSL-ready configuration
- ✅ Adds security headers
- ✅ Performs health checks

### 4. **Process Management:**
- ✅ PM2 auto-restart on crashes
- ✅ PM2 startup on server reboot
- ✅ Zero-downtime deployments
- ✅ Automatic backups

## 🔍 Monitoring & Management

### Check Application Status:
```bash
# SSH into your VPS
ssh user@your.server.ip

# Check PM2 status
pm2 list
pm2 logs fpl-checker
pm2 monit

# Check Nginx status
sudo systemctl status nginx
sudo nginx -t

# Check application health
curl http://localhost:3001
curl http://yourdomain.com
```

## 🛡️ SSL Setup (Optional)

After first deployment, set up SSL with Certbot:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## 🐛 Troubleshooting

### Deployment Fails:
1. Check GitHub Actions logs
2. Verify all secrets are set correctly
3. Ensure VPS has Node.js 18+ installed
4. Check SSH connectivity: `ssh user@your.server.ip`

### Application Not Accessible:
1. Check PM2 status: `pm2 list`
2. Check application logs: `pm2 logs fpl-checker`
3. Verify firewall: `sudo ufw status`
4. Test local access: `curl http://localhost:3001`

### Nginx Issues:
1. Test configuration: `sudo nginx -t`
2. Check status: `sudo systemctl status nginx`
3. Check logs: `sudo tail -f /var/log/nginx/error.log`

## 🎯 Benefits of This Setup:

- 🚀 **One-Push Deployment**: Just `git push` to deploy
- 🔄 **Zero Downtime**: PM2 handles graceful restarts
- 📦 **Automated Backups**: Previous version backed up
- 🛡️ **Security**: Nginx reverse proxy + security headers
- 📊 **Monitoring**: PM2 process monitoring
- 🔧 **Easy Rollback**: Previous version available
- ⚡ **Fast**: Only changed files transferred

## 🎉 You're Done!

After setup, every push to main branch automatically deploys to your VPS at `https://yourdomain.com`!