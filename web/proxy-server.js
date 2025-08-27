
require('dotenv').config();

const express = require('express');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const app = express();

// Environment configuration with defaults
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
    apiMaxRequests: parseInt(process.env.API_RATE_LIMIT_MAX) || 100,
    slowDownDelayAfter: parseInt(process.env.SLOW_DOWN_DELAY_AFTER) || 50,
    slowDownDelayMs: parseInt(process.env.SLOW_DOWN_DELAY_MS) || 100,
    slowDownMaxDelayMs: parseInt(process.env.SLOW_DOWN_MAX_DELAY_MS) || 2000
};

// Security configuration
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001').split(',');

// Request configuration
const REQUEST_CONFIG = {
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 10000,
    sizeLimit: process.env.REQUEST_SIZE_LIMIT || '10mb',
    parameterLimit: parseInt(process.env.PARAMETER_LIMIT) || 100
};

// Logging configuration
const LOGGING = {
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    enableErrorLogging: process.env.ENABLE_ERROR_LOGGING !== 'false'
};

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://fantasy.premierleague.com"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_CONFIG.windowMs,
    max: RATE_LIMIT_CONFIG.apiMaxRequests,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Slow down repeated requests
const speedLimiter = slowDown({
    windowMs: RATE_LIMIT_CONFIG.windowMs,
    delayAfter: RATE_LIMIT_CONFIG.slowDownDelayAfter,
    delayMs: RATE_LIMIT_CONFIG.slowDownDelayMs,
    maxDelayMs: RATE_LIMIT_CONFIG.slowDownMaxDelayMs,
});

// General rate limiter for all requests
const generalLimiter = rateLimit({
    windowMs: RATE_LIMIT_CONFIG.windowMs,
    max: RATE_LIMIT_CONFIG.maxRequests,
    message: {
        error: 'Too many requests, please try again later.'
    },
    skip: (req) => {
        // Skip rate limiting for static files
        return req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i);
    }
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);
app.use('/api/', speedLimiter);

app.use(express.static('.', {
    etag: true,
    setHeaders: (res, path, stat) => {
        const isVersioned = /\?v=/.test(res.req.url);
        
        if (path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
            if (isVersioned) {
                // Versioned assets - cache for 1 year
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
                // Non-versioned assets - short cache with revalidation
                res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate'); // 5 minutes
            }
        } else {
            // HTML files and other content - never cache
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Serve cached JSON files from out directory as static files
app.use('/out', express.static('./out'));

// API endpoint to list cache files matching a pattern
app.get('/api/cache-files', (req, res) => {
    try {
        const pattern = req.query.pattern;
        if (!pattern) {
            return res.status(400).json({ error: 'Pattern parameter is required' });
        }
        
        // Convert pattern to regex (e.g., gw2-league123-* becomes gw2-league123-\d+)
        const regexPattern = pattern.replace('*', '\\d+');
        const regex = new RegExp(regexPattern);
        
        const outDir = path.join(__dirname, 'out');
        if (!fs.existsSync(outDir)) {
            return res.json([]);
        }
        
        const files = fs.readdirSync(outDir)
            .filter(f => regex.test(f))
            .map(f => {
                // Extract timestamp from filename
                const match = f.match(/gw\d+-league\d+-(\d+)\.json/);
                return {
                    filename: f,
                    timestamp: match ? parseInt(match[1]) : 0
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp) // Sort by timestamp, newest first
            .slice(0, 10) // Return max 10 most recent
            .map(f => f.filename);
            
        res.json(files);
    } catch (error) {
        if (LOGGING.enableErrorLogging && !isProduction) {
            console.error('Error listing cache files:', error);
        }
        res.status(500).json({ error: 'Failed to list cache files' });
    }
});

// Secure JSON parsing with size limits
app.use(express.json({ 
    limit: REQUEST_CONFIG.sizeLimit,
    verify: (req, res, buf) => {
        // Verify JSON payload
        if (buf && buf.length) {
            req.rawBody = buf.toString('utf8');
        }
    }
}));

// Request size limiting
app.use(express.urlencoded({ 
    extended: true, 
    limit: REQUEST_CONFIG.sizeLimit,
    parameterLimit: REQUEST_CONFIG.parameterLimit
}));

// Secure CORS configuration
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    if (!origin || CORS_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || CORS_ORIGINS[0]);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Input validation middleware
const validateLeagueId = (req, res, next) => {
    const leagueId = req.body?.leagueId || req.query?.leagueId;
    if (leagueId) {
        const id = parseInt(leagueId);
        if (isNaN(id) || id < 1 || id > 999999999) {
            return res.status(400).json({ 
                error: 'Invalid league ID. Must be a number between 1 and 999999999.' 
            });
        }
    }
    next();
};

// Team data cache (3 hours)
const teamCache = new Map();
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

// Cache cleanup every hour
setInterval(() => {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of teamCache.entries()) {
        if (now - value.timestamp >= CACHE_DURATION) {
            teamCache.delete(key);
            removedCount++;
        }
    }
    
    if (removedCount > 0 && LOGGING.enableRequestLogging && !isProduction) {
        console.log(`🧹 Cache cleanup: Removed ${removedCount} expired entries. Active cache size: ${teamCache.size}`);
    }
}, 60 * 60 * 1000); // Run every hour

// Cleanup old JSON cache files every hour
setInterval(() => {
    try {
        const outDir = path.join(__dirname, 'out');
        if (!fs.existsSync(outDir)) return;
        
        const files = fs.readdirSync(outDir);
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        
        // Group files by league/gameweek
        const fileGroups = {};
        files.forEach(file => {
            const match = file.match(/gw(\d+)-league(\d+)-(\d+)\.json/);
            if (match) {
                const [, gw, league, timestamp] = match;
                const key = `gw${gw}-league${league}`;
                if (!fileGroups[key]) fileGroups[key] = [];
                fileGroups[key].push({ 
                    file, 
                    timestamp: parseInt(timestamp) 
                });
            }
        });
        
        // Keep only latest 2 files per group, delete older ones
        let deletedCount = 0;
        Object.entries(fileGroups).forEach(([key, group]) => {
            // Sort by timestamp, newest first
            group.sort((a, b) => b.timestamp - a.timestamp);
            
            // Keep latest 2 files, delete the rest if they're expired
            group.slice(2).forEach(({ file, timestamp }) => {
                if (timestamp < oneHourAgo) {
                    const filePath = path.join(outDir, file);
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    if (LOGGING.enableRequestLogging && !isProduction) {
                        console.log(`🗑️ Deleted old cache: ${file}`);
                    }
                }
            });
        });
        
        if (deletedCount > 0 && LOGGING.enableRequestLogging && !isProduction) {
            console.log(`🧹 JSON cache cleanup: Deleted ${deletedCount} old files`);
        }
    } catch (error) {
        if (LOGGING.enableErrorLogging && !isProduction) {
            console.error('Error cleaning up cache files:', error);
        }
    }
}, 60 * 60 * 1000); // Run every hour

// Path validation for FPL API
const validateFPLPath = (req, res, next) => {
    const allowedPaths = [
        '/api/bootstrap-static/',
        '/api/leagues-classic/',
        '/api/entry/'
    ];
    
    const fplPath = req.path.replace('/api/fpl', '/api');
    const isValidPath = allowedPaths.some(path => fplPath.startsWith(path));
    
    if (!isValidPath) {
        return res.status(403).json({ 
            error: 'Access denied to this API endpoint.' 
        });
    }
    
    next();
};

app.get('/api/fpl/*', validateFPLPath, (req, res) => {
    const fplPath = req.path.replace('/api/fpl', '/api');
    
    // Sanitize query parameters
    const queryString = req.url.split('?')[1];
    const fullPath = queryString ? `${fplPath}?${queryString}` : fplPath;
    
    // Check if this is a team picks endpoint that can be cached
    const teamPicksMatch = fplPath.match(/^\/api\/entry\/(\d+)\/event\/(\d+)\/picks\/$/);
    
    if (teamPicksMatch) {
        const [, teamId, gameweek] = teamPicksMatch;
        const cacheKey = `team_${teamId}_gw_${gameweek}`;
        
        // Check cache first
        const cached = teamCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            if (LOGGING.enableRequestLogging && !isProduction) {
                console.log(`📦 Cache HIT: ${cacheKey}`);
            }
            
            // Return cached data immediately with no delay
            res.status(cached.status);
            Object.keys(cached.headers).forEach(key => {
                res.set(key, cached.headers[key]);
            });
            return res.json(cached.data);
        }
        
        if (LOGGING.enableRequestLogging && !isProduction) {
            console.log(`🌐 Cache MISS: ${cacheKey} - Fetching from FPL API`);
        }
    }
    
    // Configurable request logging
    if (LOGGING.enableRequestLogging && !isProduction) {
        console.log(`Proxying: ${fullPath}`);
    }
    
    const options = {
        hostname: 'fantasy.premierleague.com',
        path: fullPath,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.status(proxyRes.statusCode);
        Object.keys(proxyRes.headers).forEach(key => {
            res.set(key, proxyRes.headers[key]);
        });
        
        // If this is a team picks endpoint, collect the response for caching
        if (teamPicksMatch && proxyRes.statusCode === 200) {
            const [, teamId, gameweek] = teamPicksMatch;
            const cacheKey = `team_${teamId}_gw_${gameweek}`;
            
            let responseData = '';
            
            proxyRes.on('data', (chunk) => {
                responseData += chunk;
                res.write(chunk);
            });
            
            proxyRes.on('end', () => {
                try {
                    const jsonData = JSON.parse(responseData);
                    
                    // Cache the successful response
                    teamCache.set(cacheKey, {
                        data: jsonData,
                        status: proxyRes.statusCode,
                        headers: proxyRes.headers,
                        timestamp: Date.now()
                    });
                    
                    if (LOGGING.enableRequestLogging && !isProduction) {
                        console.log(`💾 Cached team ${teamId} GW ${gameweek} for 3 hours`);
                    }
                } catch (error) {
                    // If JSON parsing fails, don't cache
                    if (LOGGING.enableErrorLogging && !isProduction) {
                        console.warn(`Failed to parse response for caching: ${error.message}`);
                    }
                }
                
                res.end();
            });
        } else {
            // For non-cacheable endpoints or failed requests, just pipe normally
            proxyRes.pipe(res);
        }
    });

    proxyReq.on('error', (err) => {
        if (LOGGING.enableErrorLogging && !isProduction) {
            console.error('Proxy error:', err.message);
        }
        res.status(500).json({ error: 'Service temporarily unavailable. Please try again later.' });
    });

    proxyReq.end();
});

// Simple endpoint to generate cache by running fpl-json-export.js
app.post('/api/generate-cache', (req, res) => {
    const { leagueId, gameweek } = req.body;
    
    const { spawn } = require('child_process');
    const child = spawn('node', ['fpl-json-export.js', leagueId.toString(), gameweek.toString()], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore'
    });
    
    // Unref the child process so it can run independently
    child.unref();
    
    // Return immediately without waiting
    res.json({ success: true, message: 'Generation started in background' });
});

app.post('/api/export', validateLeagueId, (req, res) => {
    const { leagueId, rules } = req.body;
    
    // Additional input validation
    if (!leagueId) {
        return res.status(400).json({ error: 'League ID is required' });
    }
    
    // Validate rules object structure
    if (rules && typeof rules !== 'object') {
        return res.status(400).json({ error: 'Invalid rules format' });
    }
    
    // Rate limiting for export endpoint (stricter)
    const exportKey = `export_${req.ip}`;
    
    if (LOGGING.enableRequestLogging && !isProduction) {
        console.log(`Starting export for league ${leagueId}...`);
    }
    
    const tempConfig = {
        league: {
            id: leagueId,
            gameweek: null
        },
        arsenal: {
            playersInStartingXI: {
                enabled: rules?.playersRule || false,
                count: rules?.playersCount || 2,
                operator: rules?.playersOperator || 'minimum',
                description: `${rules?.playersOperator || 'Minimum'} ${rules?.playersCount || 2} Arsenal players in starting XI`
            },
            captain: {
                enabled: rules?.captainRule || false,
                mustBeArsenal: true,
                description: 'Captain must be Arsenal player'
            },
            viceCaptain: {
                enabled: rules?.viceCaptainRule || false,
                mustBeArsenal: true,
                description: 'Vice-Captain must be Arsenal player'
            }
        },
        api: {
            baseUrl: "http://localhost:3001/api/fpl",
            endpoints: {
                bootstrap: "/bootstrap-static/",
                leagueStandings: "/leagues-classic/{leagueId}/standings/",
                teamPicks: "/entry/{entryId}/event/{gameweek}/picks/"
            },
            requestDelay: 50,
            batchSize: 5,
            maxRetries: 3
        },
        output: {
            enableHtmlReport: true,
            htmlReportFilenamePattern: "fpl-league-{leagueId}-gw{gameweek}-report.html",
            outputDir: "./out",
            showCompliantTeams: true,
            showNonCompliantTeams: true
        }
    };
    
    try {
        const originalConfigPath = path.join(__dirname, '..', 'rules-config.js');
        const backupConfigPath = path.join(__dirname, '..', 'rules-config.backup.js');
        const configContent = `module.exports = ${JSON.stringify(tempConfig, null, 4)};`;
        
        if (fs.existsSync(originalConfigPath)) {
            fs.copyFileSync(originalConfigPath, backupConfigPath);
        }
        fs.writeFileSync(originalConfigPath, configContent);
        const cliPath = path.join(__dirname, '..', 'fpl-checker.js');
        const child = spawn('node', [cliPath], {
            cwd: path.join(__dirname, '..')
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
            console.log(data.toString());
        });
        
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(data.toString());
        });
        
        child.on('close', (code) => {
            try {
                if (fs.existsSync(backupConfigPath)) {
                    fs.copyFileSync(backupConfigPath, originalConfigPath);
                    fs.unlinkSync(backupConfigPath);
                } else {
                    fs.unlinkSync(originalConfigPath);
                }
            } catch (err) {
                console.warn('Could not restore original config:', err.message);
            }
            
            if (code === 0) {
                const reportDir = path.join(__dirname, '..', 'out');
                if (fs.existsSync(reportDir)) {
                    const files = fs.readdirSync(reportDir);
                    const reportFile = files.find(file => file.includes(`league-${leagueId}`));
                    
                    if (reportFile) {
                        const reportPath = path.join(reportDir, reportFile);
                        const htmlContent = fs.readFileSync(reportPath, 'utf8');
                        
                        res.json({
                            success: true,
                            filename: reportFile,
                            content: htmlContent
                        });
                    } else {
                        res.status(500).json({ error: 'Report file not found' });
                    }
                } else {
                    res.status(500).json({ error: 'Reports directory not found' });
                }
            } else {
                console.error('CLI process failed with code:', code);
                console.error('Error output:', errorOutput);
                res.status(500).json({ 
                    error: 'Export failed',
                    details: errorOutput || output
                });
            }
        });
        
        child.on('error', (error) => {
            console.error('Failed to start CLI process:', error);
            try {
                if (fs.existsSync(backupConfigPath)) {
                    fs.copyFileSync(backupConfigPath, originalConfigPath);
                    fs.unlinkSync(backupConfigPath);
                } else {
                    fs.unlinkSync(originalConfigPath);
                }
            } catch (err) {
                console.warn('Could not restore original config:', err.message);
            }
            res.status(500).json({ error: 'Failed to start export process' });
        });
        
    } catch (error) {
        console.error('Error setting up export:', error);
        res.status(500).json({ error: 'Failed to setup export process' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('./package.json').version,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Dynamic robots.txt
app.get('/robots.txt', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml`);
});

// Dynamic sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const lastmod = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/out/')) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else if (req.path.startsWith('/out/')) {
        // If /out/ request reaches here, file wasn't found
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`
    🚀 Local FPL Proxy Server running!
    
    📱 Open your browser and go to:
    http://localhost:${PORT}
    
    This server bypasses CORS issues by proxying FPL API calls.
    
    To stop the server: Press Ctrl+C
    `);
});

module.exports = app;