const fs = require('fs');
const path = require('path');

/**
 * Build version generator
 * Creates a version hash based on current timestamp for cache busting
 */
function generateVersion() {
    const timestamp = Date.now();
    const version = timestamp.toString();
    
    console.log(`🔨 Generating build version: ${version}`);
    
    // Write version file
    const versionData = {
        version: version,
        timestamp: timestamp,
        buildDate: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join(__dirname, 'version.json'), JSON.stringify(versionData, null, 2));
    
    return version;
}

/**
 * Update HTML files with versioned assets
 */
function updateHTMLWithVersion(version) {
    const indexPath = path.join(__dirname, 'index.html');
    
    if (!fs.existsSync(indexPath)) {
        console.log('❌ index.html not found, skipping HTML update');
        return;
    }
    
    let html = fs.readFileSync(indexPath, 'utf8');
    
    // Update CSS links
    html = html.replace(
        /(<link[^>]*href=["']?)([^"'?]+\.css)(\?v=[^"']*)?/g,
        `$1$2?v=${version}`
    );
    
    // Update JS script sources
    html = html.replace(
        /(<script[^>]*src=["']?)([^"'?]+\.js)(\?v=[^"']*)?/g,
        `$1$2?v=${version}`
    );
    
    // Update any other asset references (images, fonts, etc.)
    html = html.replace(
        /(src=["']?)([^"'?]+\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot))(\?v=[^"']*)?/g,
        `$1$2?v=${version}`
    );
    
    fs.writeFileSync(indexPath, html);
    console.log(`✅ Updated index.html with version ${version}`);
}

// Main execution
if (require.main === module) {
    const version = generateVersion();
    updateHTMLWithVersion(version);
    console.log(`🎉 Build versioning complete! Version: ${version}`);
}

module.exports = { generateVersion, updateHTMLWithVersion };