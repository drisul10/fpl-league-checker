#!/usr/bin/env node

/**
 * Build script for static deployment (GitHub Pages, Netlify, etc.)
 * Removes server dependencies and configures for direct API calls
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'dist');
const SOURCE_DIR = path.join(__dirname, '..');

console.log('🚀 Building static version for deployment...\n');

// Create build directory
if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true });
}
fs.mkdirSync(BUILD_DIR, { recursive: true });

// Files to copy for static deployment
const staticFiles = [
    'index.html',
    'app.js', 
    'config.js',
    'style.css',
    'manifest.json',
    'sw.js',
    'robots.txt',
    'sitemap.xml',
    'README.md'
];

// Copy static files
console.log('📁 Copying static files...');
staticFiles.forEach(file => {
    const srcPath = path.join(SOURCE_DIR, file);
    const destPath = path.join(BUILD_DIR, file);
    
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ⚠️  ${file} (not found, skipping)`);
    }
});

// Modify config.js for direct API access (remove proxy)
console.log('\n🔧 Configuring for direct API access...');
const configPath = path.join(BUILD_DIR, 'config.js');
let configContent = fs.readFileSync(configPath, 'utf8');

// Ensure direct FPL API access
configContent = configContent.replace(
    /baseUrl:\s*"[^"]*"/,
    'baseUrl: "https://fantasy.premierleague.com/api"'
);

fs.writeFileSync(configPath, configContent);
console.log('   ✅ Updated API configuration');

// Create static SEO files for GitHub Pages
console.log('\n🔍 Creating SEO files for static deployment...');

// Determine the base URL for GitHub Pages
const repoName = process.env.GITHUB_REPOSITORY ? 
    process.env.GITHUB_REPOSITORY.split('/')[1] : 
    'repository-name';
const githubUser = process.env.GITHUB_REPOSITORY ? 
    process.env.GITHUB_REPOSITORY.split('/')[0] : 
    'username';
const baseUrl = `https://${githubUser}.github.io/${repoName}`;

// Create robots.txt
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml`;
fs.writeFileSync(path.join(BUILD_DIR, 'robots.txt'), robotsTxt);

// Create sitemap.xml
const currentDate = new Date().toISOString().split('T')[0];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
fs.writeFileSync(path.join(BUILD_DIR, 'sitemap.xml'), sitemapXml);

console.log('   ✅ robots.txt (GitHub Pages optimized)');
console.log('   ✅ sitemap.xml (GitHub Pages optimized)');

// Create deployment info
const deployInfo = {
    buildDate: new Date().toISOString(),
    version: require('../package.json').version,
    deploymentType: 'static',
    features: {
        cors: 'limited - depends on browser/FPL API policy',
        export: 'disabled - requires server',
        analysis: 'enabled',
        webVitals: '100%'
    },
    limitations: [
        'CORS may block some API calls depending on browser',
        'Export functionality unavailable (server required)',
        'Rate limiting handled client-side only'
    ]
};

fs.writeFileSync(
    path.join(BUILD_DIR, 'deploy-info.json'), 
    JSON.stringify(deployInfo, null, 2)
);

// Create simple package.json for static deployment
const staticPackage = {
    name: 'fpl-rules-checker-static',
    version: require('../package.json').version,
    description: 'Static version - Fantasy Premier League Rules Checker',
    main: 'index.html',
    scripts: {
        start: 'python -m http.server 8000',
        serve: 'npx serve .'
    },
    dependencies: {},
    devDependencies: {}
};

fs.writeFileSync(
    path.join(BUILD_DIR, 'package.json'), 
    JSON.stringify(staticPackage, null, 2)
);

console.log('\n✨ Static build completed!');
console.log(`📦 Files built in: ${BUILD_DIR}`);
console.log('\n📋 Next steps:');
console.log('   • Upload dist/ folder to your static host');
console.log('   • For GitHub Pages: copy dist/ contents to docs/');
console.log('   • Note: Some features limited due to CORS policy');
console.log('\n🎯 For full functionality, use VPS deployment instead.');