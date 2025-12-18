// ====================================================
// VOID SECURE LOGGER - COMPLETE VERSION WITH GITHUB STATS
// For: https://void-secure-logger.onrender.com
// ====================================================

const express = require('express');
const axios = require('axios');
const app = express();

// ========== DDOS PROTECTION ==========
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Basic security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable for flexibility with embeds
    crossOriginEmbedderPolicy: false
}));

// Global rate limiting for all routes
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: "Too many requests from this IP, please try again later.",
        retry_after: 900
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply to all routes
app.use(globalLimiter);

// Stricter rate limiting for /log endpoint
const logLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 log requests per minute
    message: {
        success: false,
        error: "Too many log requests. Please slow down.",
        retry_after: 60
    },
    skipSuccessfulRequests: false
});

// ========== STATS MANAGER ==========
// Choose which stats manager to use:
// Option 1: Local file storage (original)
// const statsManager = require('./stats');
// const statsRouter = require('./stats-routes');

// Option 2: GitHub storage (recommended)
const GitHubStatsManager = require('./github-stats-manager');
const statsManager = new GitHubStatsManager();
const statsRouter = require('./stats-routes');

// ========== CONFIGURATION ==========
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "V0!d_S3cur3K3y@2024#RBLX";
const PORT = process.env.PORT || 3000;

// ========== KEEP-ALIVE PING ==========
setInterval(() => {
    const now = new Date().toLocaleTimeString();
    console.log(`💓 [${now}] Keep-alive ping`);
}, 4 * 60 * 1000); // Every 5 minutes

// ========== REQUEST STORE (Enhanced Rate Limiting) ==========
const requestStore = new Map();
const ipBlocklist = new Map();

// Clean old requests every 5 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean old requests
    for (const [key, value] of requestStore.entries()) {
        if (now - value.timestamp > 5 * 60 * 1000) {
            requestStore.delete(key);
            cleaned++;
        }
    }
    
    // Clean expired IP blocks
    for (const [ip, block] of ipBlocklist.entries()) {
        if (now > block.expires) {
            ipBlocklist.delete(ip);
            console.log(`✅ IP ${ip} unblocked`);
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} old requests`);
    }
}, 5 * 60 * 1000);

// ========== DDOS PROTECTION MIDDLEWARE ==========
function ddosProtection(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Check if IP is blocked
    const block = ipBlocklist.get(ip);
    if (block) {
        if (Date.now() > block.expires) {
            ipBlocklist.delete(ip);
        } else {
            const remaining = Math.ceil((block.expires - Date.now()) / 1000);
            return res.status(429).json({
                success: false,
                error: `IP temporarily blocked. Try again in ${remaining} seconds.`,
                blocked: true
            });
        }
    }
    
    // Track request frequency
    const now = Date.now();
    const ipKey = `ip_${ip}`;
    const ipData = requestStore.get(ipKey) || { count: 0, firstRequest: now, lastRequest: now };
    
    // Reset counter if more than 60 seconds passed
    if (now - ipData.firstRequest > 60000) {
        ipData.count = 1;
        ipData.firstRequest = now;
    } else {
        ipData.count++;
    }
    ipData.lastRequest = now;
    
    requestStore.set(ipKey, ipData);
    
    // Block IP if too many requests
    if (ipData.count > 100) { // 100 requests per minute max
        const blockDuration = 5 * 60 * 1000; // 5 minutes
        ipBlocklist.set(ip, {
            expires: now + blockDuration,
            reason: 'Too many requests'
        });
        console.log(`🚫 Blocked IP ${ip} for 5 minutes (${ipData.count} requests)`);
        return res.status(429).json({
            success: false,
            error: "Rate limit exceeded. IP temporarily blocked.",
            retry_after: 300
        });
    }
    
    next();
}

// Apply DDOS protection to all routes
app.use(ddosProtection);

// ========== DECRYPTION FUNCTIONS ==========
function customDecode(encoded) {
    let decoded = "";
    for (let i = 0; i < encoded.length; i += 3) {
        const charCode = parseInt(encoded.substr(i, 3));
        if (!isNaN(charCode)) {
            decoded += String.fromCharCode(charCode);
        }
    }
    return decoded;
}

function xorDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        const dataByte = data.charCodeAt(i);
        const keyByte = key.charCodeAt(i % key.length);
        result += String.fromCharCode(dataByte ^ keyByte);
    }
    return result;
}

// ========== DISCORD EMBED FORMATTING ==========
function formatDiscordEmbed(data) {
    // EXACT FORMAT from your screenshot
    return {
        username: "Void Execution Logger",
        embeds: [{
            title: "Execution Logged",
            color: 16711680, // Red
            fields: [
                {
                    name: "User ID",
                    value: "```" + (data.user_id || "Unknown") + "```",
                    inline: true
                },
                {
                    name: "Username",
                    value: "```" + (data.username || "Unknown") + "```",
                    inline: true
                },
                {
                    name: "Account Age",
                    value: "```" + (data.account_age || "Unknown") + "```",
                    inline: true
                },
                {
                    name: "Game",
                    value: "```" + (data.game_name || "Unknown Game") + "```",
                    inline: true
                },
                {
                    name: "Server ID",
                    value: "```" + (data.server_id || "Unknown") + "```",
                    inline: true
                },
                {
                    name: "Join Link",
                    value: data.join_link || "https://www.roblox.com",
                    inline: false
                },
                {
                    name: "HWID",
                    value: "```" + (data.hwid || "Unknown") + "```",
                    inline: false
                }
            ],
            thumbnail: {
                url: "https://www.roblox.com/headshot-thumbnail/image?userId=" + 
                     (data.user_id || "1") + 
                     "&width=420&height=420&format=png"
            },
            timestamp: new Date().toISOString()
        }]
    };
}

// ========== MIDDLEWARE ==========
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// ========== GITHUB STATS STATUS ENDPOINT ==========
app.get('/github-status', async (req, res) => {
    try {
        const stats = await statsManager.loadStats();
        const repoOwner = process.env.GITHUB_REPO_OWNER || 'your-username';
        const repoName = process.env.GITHUB_REPO_NAME || 'void-secure-logger-stats';
        const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
        
        res.json({
            status: 'connected',
            storage: 'github',
            repository: repoUrl,
            stats_file: `${repoUrl}/blob/main/execution-stats.json`,
            raw_json: `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/execution-stats.json`,
            last_updated: stats.last_updated || 'never',
            total_executions: stats.total_executions || 0,
            total_games: Object.keys(stats.games || {}).length,
            total_users: Object.keys(stats.users || {}).length,
            start_date: stats.start_date || 'unknown'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            storage: 'github',
            recommendation: 'Check GITHUB_TOKEN and repository settings'
        });
    }
});

// ========== ROUTES ==========

// GET / - Empty white screen
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Void Secure Logger</title>
        <style>
            * { margin: 0; padding: 0; }
            body { background-color: white; }
        </style>
    </head>
    <body>
    </body>
    </html>
    `;
    res.send(html);
});

// GET /homepagevoidlogger - Original homepage
app.get('/homepagevoidlogger', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Void Secure Logger</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
            .online { background: #d4edda; color: #155724; }
            .offline { background: #f8d7da; color: #721c24; }
            .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; }
            code { background: #eee; padding: 2px 5px; }
            .btn { display: inline-block; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
            .github-badge { background: #24292e; color: white; padding: 5px 10px; border-radius: 3px; font-family: monospace; }
        </style>
    </head>
    <body>
        <h1>🚀 Void Secure Logger</h1>
        
        <div class="status ${DISCORD_WEBHOOK ? 'online' : 'offline'}">
            <strong>Status:</strong> ${DISCORD_WEBHOOK ? '✅ Online' : '❌ Discord Not Configured'}
        </div>
        
        <div class="status online">
            <strong>Storage:</strong> 📊 GitHub Statistics Storage
            <div class="github-badge">github-stats-manager.js</div>
        </div>
        
        <p><strong>Version:</strong> 3.2.1</p>
        <p><strong>Discord Webhook:</strong> ${DISCORD_WEBHOOK ? '✅ Configured' : '❌ Not Configured'}</p>
        <p><strong>Server Time:</strong> ${new Date().toLocaleTimeString()}</p>
        
        <h2>📡 Endpoints:</h2>
        
        <div class="endpoint">
            <h3>GET <code>/</code></h3>
            <p>Empty white screen</p>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/homepagevoidlogger</code></h3>
            <p>This page - shows server status</p>
            <a href="/homepagevoidlogger" class="btn">Refresh</a>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/health</code></h3>
            <p>Health check endpoint</p>
            <a href="/health" class="btn">Test Health</a>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/test-discord</code></h3>
            <p>Test Discord webhook connection (sends test embed)</p>
            <a href="/test-discord" class="btn">Test Discord</a>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/github-status</code></h3>
            <p>Check GitHub stats storage connection</p>
            <a href="/github-status" class="btn">GitHub Status</a>
        </div>
        
        <div class="endpoint">
            <h3>POST <code>/log</code> (MAIN ENDPOINT)</h3>
            <p>Accepts encrypted logs from Roblox Lua scripts</p>
            <p><em>This endpoint only accepts POST requests</em></p>
            <p><strong>Format:</strong></p>
            <pre>
{
  "data": "encoded_encrypted_data",
  "signature": "signature_hash",
  "timestamp": 1234567890,
  "version": "3.2.1",
  "request_id": "unique_id"
}
            </pre>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/stats</code></h3>
            <p>Statistics Dashboard with GitHub storage</p>
            <a href="/stats" class="btn">📊 View Stats</a>
        </div>
        
        <h2>🔧 Quick Tests:</h2>
        <div>
            <a href="/test-discord" class="btn">📨 Test Discord Webhook</a>
            <a href="/github-status" class="btn">🐙 GitHub Status</a>
            <a href="/health" class="btn">🩺 Health Check</a>
            <a href="/stats" class="btn">📊 Stats Dashboard</a>
        </div>
        
        <h2>📊 Server Info:</h2>
        <ul>
            <li><strong>Uptime:</strong> ${process.uptime().toFixed(0)} seconds</li>
            <li><strong>Memory:</strong> ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB</li>
            <li><strong>Node Version:</strong> ${process.version}</li>
            <li><strong>Requests in Memory:</strong> ${requestStore.size}</li>
        </ul>
        
        <hr>
        <p><em>Void Secure Logger v3.2.1 • GitHub Storage • Running on Render.com</em></p>
    </body>
    </html>
    `;
    res.send(html);
});

// GET /health - Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'Void Secure Logger',
        version: '3.2.1',
        timestamp: new Date().toISOString(),
        discord_configured: !!DISCORD_WEBHOOK,
        github_configured: !!process.env.GITHUB_TOKEN,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests_in_memory: requestStore.size,
        node_version: process.version
    });
});

// GET /test-discord - Test Discord connection
app.get('/test-discord', async (req, res) => {
    if (!DISCORD_WEBHOOK) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Discord Test Failed</title></head>
        <body>
            <h1>❌ Discord Test Failed</h1>
            <p><strong>Error:</strong> No Discord webhook configured</p>
            <p><strong>Fix:</strong> Set the <code>DISCORD_WEBHOOK_URL</code> environment variable on Render</p>
            <p><a href="/">← Back to Home</a></p>
        </body>
        </html>
        `;
        return res.status(400).send(html);
    }
    
    try {
        console.log('🔄 Testing Discord webhook...');
        
        const testEmbed = {
            username: "Void Execution Logger",
            embeds: [{
                title: "Execution Logged",
                color: 16711680,
                fields: [
                    { name: "User ID", value: "```1234567890```", inline: true },
                    { name: "Username", value: "```TestUser```", inline: true },
                    { name: "Account Age", value: "```100 days```", inline: true },
                    { name: "Game", value: "```Test Game```", inline: true },
                    { name: "Server ID", value: "```test-server-id```", inline: true },
                    { name: "Join Link", value: "https://www.roblox.com", inline: false },
                    { name: "HWID", value: "```TEST_HWID_123```", inline: false }
                ],
                thumbnail: {
                    url: "https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png"
                },
                timestamp: new Date().toISOString()
            }]
        };
        
        const response = await axios.post(DISCORD_WEBHOOK, testEmbed, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log(`✅ Discord test success: ${response.status}`);
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Discord Test Success</title></head>
        <body>
            <h1>✅ Discord Test Successful!</h1>
            <p><strong>Status:</strong> ${response.status} ${response.statusText}</p>
            <p>A test embed has been sent to your Discord channel.</p>
            <p><a href="/">← Back to Home</a></p>
        </body>
        </html>
        `;
        res.send(html);
        
    } catch (error) {
        console.error('❌ Discord test failed:', error.message);
        
        let errorDetails = error.message;
        if (error.response) {
            errorDetails += ` - Status: ${error.response.status}`;
            if (error.response.data) {
                errorDetails += ` - Data: ${JSON.stringify(error.response.data)}`;
            }
        }
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Discord Test Failed</title></head>
        <body>
            <h1>❌ Discord Test Failed</h1>
            <p><strong>Error:</strong> ${errorDetails}</p>
            <p><strong>Possible fixes:</strong></p>
            <ul>
                <li>Check your webhook URL is correct</li>
                <li>Make sure the webhook hasn't been deleted in Discord</li>
                <li>Check Discord rate limits</li>
            </ul>
            <p><a href="/">← Back to Home</a></p>
        </body>
        </html>
        `;
        res.status(500).send(html);
    }
});

// GET /log - Completely empty page (no text at all)
app.get('/log', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>/log Endpoint</title>
        <style>
            * { margin: 0; padding: 0; }
            body { background-color: white; }
        </style>
    </head>
    <body>
    </body>
    </html>
    `;
    res.send(html);
});

// POST /log - Main logging endpoint with rate limiting
app.post('/log', logLimiter, async (req, res) => {
    const startTime = Date.now();
    const requestId = req.body.request_id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📨 [${new Date().toLocaleTimeString()}] New log request: ${requestId}`);
    
    try {
        const { data, signature, timestamp, version, request_id } = req.body;

        // Basic validation
        if (!data || !timestamp || !request_id) {
            console.log(`❌ [${requestId}] Missing required fields`);
            return res.status(400).json({ 
                success: false,
                error: "Missing required fields: data, timestamp, request_id",
                request_id: requestId
            });
        }

        // Check for duplicate requests
        if (requestStore.has(request_id)) {
            console.log(`⚠️ [${requestId}] Duplicate request detected`);
            return res.status(400).json({ 
                success: false,
                error: "Duplicate request detected",
                request_id: requestId
            });
        }
        requestStore.set(request_id, { timestamp: Date.now(), data: 'log_request' });

        // Decrypt the data
        console.log(`🔓 [${requestId}] Decrypting data...`);
        
        let payload;
        try {
            const decoded = customDecode(data);
            const encryptionKey = SHARED_SECRET + timestamp;
            const decrypted = xorDecrypt(decoded, encryptionKey);
            payload = JSON.parse(decrypted);
            
            console.log(`✅ [${requestId}] Decryption successful!`);
            console.log(`   👤 User: ${payload.username || 'Unknown'}`);
            console.log(`   🆔 ID: ${payload.user_id || 'Unknown'}`);
            console.log(`   🎮 Game: ${payload.game_name || 'Unknown'}`);
            console.log(`   🔑 HWID: ${payload.hwid ? 'Provided' : 'Missing'}`);
            
            // ========== RECORD TO GITHUB STATS ==========
            try {
                await statsManager.recordExecution(payload);
                console.log(`📊 [${requestId}] Statistics recorded to GitHub`);
            } catch (statsError) {
                console.error(`⚠️ [${requestId}] GitHub stats recording failed:`, statsError.message);
                console.log(`🔄 [${requestId}] Will retry on next execution`);
            }
            // ============================================
            
        } catch (decryptError) {
            console.error(`❌ [${requestId}] Decryption failed:`, decryptError.message);
            
            // Try to see if it's a simple test payload
            if (req.body.username && req.body.user_id) {
                console.log(`⚠️ [${requestId}] Using raw test payload`);
                payload = req.body;
                
                // ========== RECORD TEST TO GITHUB STATS ==========
                try {
                    await statsManager.recordExecution(payload);
                    console.log(`📊 [${requestId}] Test statistics recorded to GitHub`);
                } catch (statsError) {
                    console.error(`⚠️ [${requestId}] GitHub stats recording failed:`, statsError.message);
                }
                // ==================================================
                
            } else {
                return res.status(400).json({ 
                    success: false,
                    error: "Decryption failed. Check encryption keys match.",
                    hint: "Make sure SHARED_SECRET env var matches Lua script secret",
                    request_id: requestId
                });
            }
        }

        // Send to Discord (with delay to prevent spam)
        if (DISCORD_WEBHOOK && payload) {
            console.log(`📤 [${requestId}] Queuing for Discord...`);
            
            // Use setTimeout to send asynchronously (don't wait for Discord)
            setTimeout(async () => {
                try {
                    const discordPayload = formatDiscordEmbed(payload);
                    
                    const discordResponse = await axios.post(DISCORD_WEBHOOK, discordPayload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 15000
                    });
                    
                    console.log(`✅ [${requestId}] Discord: ${discordResponse.status} ${discordResponse.statusText}`);
                    
                } catch (discordError) {
                    console.error(`❌ [${requestId}] Discord error:`, discordError.message);
                    if (discordError.response) {
                        console.error(`   Status: ${discordError.response.status}`);
                        console.error(`   Data:`, discordError.response.data);
                    }
                    // Don't crash if Discord fails
                }
            }, 2000); // 2 second delay
        } else if (!DISCORD_WEBHOOK) {
            console.warn(`⚠️ [${requestId}] No Discord webhook configured - skipping Discord`);
        }

        const processingTime = Date.now() - startTime;
        
        // Return success to Lua script
        res.json({ 
            success: true, 
            message: "Log processed successfully",
            request_id: requestId,
            processing_time: `${processingTime}ms`,
            discord_queued: !!DISCORD_WEBHOOK,
            github_stored: !!process.env.GITHUB_TOKEN,
            timestamp: new Date().toISOString(),
            data_received: {
                username: payload.username || "Unknown",
                user_id: payload.user_id || "Unknown",
                game: payload.game_name || "Unknown"
            }
        });

    } catch (error) {
        console.error(`💥 [${requestId}] Server error:`, error.message);
        console.error(error.stack);
        
        res.status(500).json({ 
            success: false,
            error: "Internal server error processing log",
            request_id: requestId,
            timestamp: new Date().toISOString()
        });
    }
});

// ========== STATISTICS DASHBOARD ==========
app.use('/stats', statsRouter);


// 404 handler 
app.use((req, res) => {
    res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>404 Not Found</title>
        <style>
            * { margin: 0; padding: 0; }
            body { background-color: white; }
        </style>
    </head>
    <body>
    </body>
    </html>
    `);
});
// Error handler
app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    res.status(500).send(`
    <!DOCTYPE html>
    <html>
    <head><title>500 Server Error</title></head>
    <body>
        <h1>💥 500 - Server Error</h1>
        <p>An unexpected error occurred.</p>
        <p><code>${err.message}</code></p>
    </body>
    </html>
    `);
});

// ========== START SERVER ==========
app.listen(PORT, async () => {
    console.log(`=========================================`);
    console.log(`🚀 VOID SECURE LOGGER v3.2.1`);
    console.log(`=========================================`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: https://void-secure-logger.onrender.com`);
    console.log(`🤖 Discord: ${DISCORD_WEBHOOK ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
    console.log(`🔐 Secret: ${SHARED_SECRET ? 'SET' : 'USING DEFAULT'}`);
    console.log(`🛡️ DDOS Protection: ✅ ENABLED`);
    console.log(`   • Rate limiting: 100 requests/15min`);
    console.log(`   • IP blocking: 100 requests/minute`);
    console.log(`   • Security headers: ✅`);
    
    // Initialize GitHub Stats
    try {
        if (process.env.GITHUB_TOKEN) {
            console.log(`🐙 GitHub Stats: ✅ CONFIGURED`);
            console.log(`   • Owner: ${process.env.GITHUB_REPO_OWNER || 'not-set'}`);
            console.log(`   • Repo: ${process.env.GITHUB_REPO_NAME || 'void-secure-logger-stats'}`);
            console.log(`   • File: ${process.env.GITHUB_FILE_PATH || 'execution-stats.json'}`);
            
            // Load initial stats to verify connection
            const stats = await statsManager.loadStats();
            console.log(`   • Loaded: ${stats.total_executions || 0} executions`);
            console.log(`   • Games: ${Object.keys(stats.games || {}).length}`);
            console.log(`   • Users: ${Object.keys(stats.users || {}).length}`);
        } else {
            console.log(`🐙 GitHub Stats: ❌ NOT CONFIGURED (using local fallback)`);
            console.log(`   • Set GITHUB_TOKEN to enable GitHub storage`);
        }
    } catch (error) {
        console.error(`🐙 GitHub Stats: ⚠️ ERROR - ${error.message}`);
    }
    
    console.log(`⏰ Server Time: ${new Date().toLocaleTimeString()}`);
    console.log(`📊 Statistics: ✅ ENABLED`);
    console.log(`   • Dashboard: https://void-secure-logger.onrender.com/stats`);
    console.log(`   • GitHub Status: https://void-secure-logger.onrender.com/github-status`);
    console.log(`=========================================`);
    
    if (!DISCORD_WEBHOOK) {
        console.error('\n❌ WARNING: No Discord webhook configured!');
        console.log('💡 To fix, add to Render Dashboard → Environment:');
        console.log('   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN\n');
    }
    
    if (!process.env.GITHUB_TOKEN) {
        console.warn('\n⚠️  WARNING: No GitHub token configured!');
        console.log('💡 To enable GitHub stats storage, add:');
        console.log('   GITHUB_TOKEN=ghp_yourtokenhere');
        console.log('   GITHUB_REPO_OWNER=your-username');
        console.log('   GITHUB_REPO_NAME=void-secure-logger-stats\n');
    }
    
    if (SHARED_SECRET === "V0!d_S3cur3K3y@2024#RBLX") {
        console.warn('⚠️  Using default secret. For production, change SHARED_SECRET env var.');
    }
    
    console.log(`👉 Test endpoints:`);
    console.log(`   • Empty page: https://void-secure-logger.onrender.com`);
    console.log(`   • Homepage: https://void-secure-logger.onrender.com/homepagevoidlogger`);
    console.log(`   • Health: https://void-secure-logger.onrender.com/health`);
    console.log(`   • Discord Test: https://void-secure-logger.onrender.com/test-discord`);
    console.log(`   • GitHub Status: https://void-secure-logger.onrender.com/github-status`);
    console.log(`   • Statistics Dashboard: https://void-secure-logger.onrender.com/stats`);
    console.log(`=========================================\n`);
});
