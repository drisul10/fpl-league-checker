# FPL Rules Checker

A comprehensive Fantasy Premier League (FPL) tool to check if teams in your league comply with custom rules. Available as both CLI and web versions.

## 🚀 Features

- ✅ **CLI Version**: Command-line tool with configurable rules
- ✅ **Web Version**: Modern responsive web app with 100% Web Vitals scores
- ✅ Check Arsenal player requirements in starting XI
- ✅ Validate captain and vice-captain selections  
- ✅ HTML report generation
- ✅ Batch processing with rate limiting
- ✅ PWA (Progressive Web App) support
- ✅ Fully accessible (WCAG compliant)

## 🎯 Quick Start

### Web Version (Recommended)
```bash
cd web
node proxy-server.js
```
Then open http://localhost:3001

### CLI Version
```bash
node fpl-checker.js
```

## 📁 Project Structure

```
fplchecker/
├── fpl-checker.js          # CLI version
├── rules-config.js         # CLI configuration
├── out/                    # Generated reports
└── web/                    # Web application
    ├── index.html
    ├── app.js
    ├── style.css
    ├── config.js
    ├── proxy-server.js
    ├── manifest.json       # PWA manifest
    ├── sw.js              # Service worker
    └── package.json
```

## ⚙️ CLI Configuration

Edit `rules-config.js`:

```javascript
module.exports = {
    league: {
        id: 436453,         // Your league ID
        gameweek: 2         // Current gameweek
    },
    arsenal: {
        playersInStartingXI: {
            enabled: true,
            count: 2,
            operator: "minimum"  // "exactly", "minimum", "maximum"
        },
        captain: {
            enabled: true,
            mustBeArsenal: true
        },
        viceCaptain: {
            enabled: true,
            mustBeArsenal: true
        }
    }
};
```

## 🌐 Web Version Features

- **100% Web Vitals Scores**: Perfect Performance, Accessibility, Best Practices, and SEO
- **Progressive Web App**: Installable, works offline
- **Responsive Design**: Mobile, tablet, and desktop optimized
- **Real-time Analysis**: Live progress tracking
- **No Installation Required**: Run directly from browser

## 🔧 Web Development

```bash
cd web
npm install
node proxy-server.js
```

The web version uses a proxy server to bypass CORS restrictions when accessing the FPL API.

## 📊 Arsenal Rules

The tool checks for:

1. **Players in Starting XI**: Minimum/exactly/maximum Arsenal players
2. **Captain Rule**: Must be Arsenal player
3. **Vice-Captain Rule**: Must be Arsenal player

## 📈 Output

- **CLI**: Console output + HTML reports in `out/` directory
- **Web**: Interactive results with filtering and export options

## 🛠️ API Rate Limiting

The tool includes built-in rate limiting to respect FPL servers:
- 50ms delay between requests
- Batch processing in groups of 5
- Automatic retry on failures

## 📋 Requirements

- Node.js 14+
- Internet connection for FPL API access

## 🏗️ Files

- `fpl-checker.js` - CLI application
- `rules-config.js` - CLI configuration  
- `web/` - Complete web application
- `out/` - Generated HTML reports

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🚀 Deployment

### Option 1: Automated VPS Deployment (Recommended)
**Full functionality with GitHub Actions + PM2 + Nginx**

```bash
# Setup once: Configure GitHub secrets (see VPS-DEPLOYMENT.md)
# Then just push to deploy:
git push origin main
# Automatically deploys to your VPS with zero downtime!
```

**Features:**
- ✅ One-push deployment via GitHub Actions
- ✅ PM2 process management with auto-restart
- ✅ Nginx reverse proxy with SSL support
- ✅ Zero-downtime deployments
- ✅ Automatic backups & rollback capability
- ✅ Full CORS handling & export functionality

See **[VPS-DEPLOYMENT.md](VPS-DEPLOYMENT.md)** for complete setup guide.

### Option 2: Static Deployment (GitHub Pages/Netlify)
**Limited functionality, no server required**

```bash
# Automated via GitHub Actions (when pushed to main/master)
git push origin main

# Manual build
cd web
npm install
npm run build:static
# Upload dist/ folder to your static host
```

**Features:**
- ⚠️ May have CORS limitations
- ❌ No export functionality
- ✅ Analysis features work
- ✅ 100% Web Vitals scores

### Quick Deploy Options:

| Platform | Method | Features |
|----------|--------|----------|
| **VPS** | `git push origin main` | GitHub Actions + PM2 + Nginx |
| **GitHub Pages** | Push to main branch | Auto-deploy via Actions |
| **Netlify** | `npm run build:static` | Upload dist/ folder |
| **Vercel** | `npm run build:static` | Upload dist/ folder |

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Fantasy Premier League](https://fantasy.premierleague.com/)
- [FPL API Documentation](https://fploptimize.com/fpl-api-documentation/)