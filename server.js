// ====================================================
// VOID SECURE LOGGER + KEEP-ALIVE (COMBINED)
// ====================================================
const express = require('express');
const axios = require('axios');
const app = express();

// ========== CONFIGURATION ==========
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "V0!d_S3cur3K3y@2024#RBLX";
const PORT = process.env.PORT || 3000;

// ========== KEEP-ALIVE PING ==========
setInterval(() => {
    const now = new Date().toLocaleTimeString();
    console.log(`💓 [${now}] Keep-alive ping`);
    
    // Also log memory usage
    const used = process.memoryUsage();
    console.log(`📊 Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 5 * 60 * 1000); // Every 5 minutes

// ========== VOID LOGGER CORE ==========
// Request store for rate limiting (in-memory for Render)
const requestStore = new Map();

// Clean old requests every 5 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of requestStore.entries()) {
        if (now - value > 5 * 60 * 1000) {
            requestStore.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} old requests`);
    }
}, 5 * 60 * 1000);

// Custom decode (matches Lua encoding)
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

// XOR decrypt (matches Lua)
function xorDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        const dataByte = data.charCodeAt(i);
        const keyByte = key.charCodeAt(i % key.length);
        result += String.fromCharCode(dataByte ^ keyByte);
    }
    return result;
}

// Validate request signature
function validateSignature(payload, signature, timestamp) {
    let dataString = "";
    Object.keys(payload).sort().forEach(key => {
        dataString += key + "=" + payload[key] + "|";
    });

    const message = SHARED_SECRET + timestamp + dataString;
    let hash = 0;

    for (let i = 0; i < message.length; i++) {
        const char = message.charCodeAt(i);
        hash ^= (char << ((i % 4) * 8));
        hash = (hash * 16777619) >>> 0;
    }

    const expectedSig = hash.toString(16).toUpperCase().padStart(8, '0');
    return expectedSig === signature;
}

// Format Discord embed
function formatDiscordEmbed(data) {
    return {
        username: "Void Execution Logger",
        avatar_url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=420&height=420&format=png`,
        embeds: [{
            title: "🎮 Execution Logged",
            color: 65280, // Green
            fields: [
                { 
                    name: "👤 Player Info", 
                    value: `**Username:** ${data.username}\n**Display:** ${data.display_name || "N/A"}\n**ID:** \`${data.user_id}\``, 
                    inline: true 
                },
                { 
                    name: "📅 Account Age", 
                    value: `\`${data.account_age}\``, 
                    inline: true 
                },
                { 
                    name: "🕐 Time", 
                    value: `${data.execution_time}\n${data.execution_date}`, 
                    inline: true 
                },
                { 
                    name: "🎯 Game Info", 
                    value: `**${data.game_name}**\nPlace ID: \`${data.place_id}\`\nServer: \`${data.server_id}\``, 
                    inline: false 
                },
                { 
                    name: "🔗 Join Link", 
                    value: `[Click to Join](${data.join_link})`, 
                    inline: true 
                },
                { 
                    name: "🆔 HWID", 
                    value: `\`${data.hwid}\``, 
                    inline: true 
                }
            ],
            thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=150&height=150&format=png`
            },
            timestamp: new Date().toISOString(),
            footer: {
                text: `Void Logger v${data.script_version || "2.8.0"} • Roblox ${data.roblox_version || "Unknown"}`
            }
        }]
    };
}

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ========== ROUTES ==========
// Health check endpoint
app.get('/', (req, res) => {
    const now = new Date().toLocaleTimeString();
    res.json({ 
        status: 'online',
        service: 'Void Secure Logger',
        version: '2.8.0',
        host: 'Render.com',
        time: now,
        uptime: `${Math.floor(process.uptime() / 60)} minutes`,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        endpoints: {
            log: 'POST /log',
            health: 'GET /health',
            stats: 'GET /stats'
        },
        message: '✅ Server is running and ready to receive logs'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: requestStore.size,
        discord_webhook: DISCORD_WEBHOOK ? 'CONFIGURED' : 'MISSING',
        timestamp: new Date().toISOString()
    });
});

app.get('/stats', (req, res) => {
    res.json({
        total_requests: requestStore.size,
        active_sessions: Array.from(requestStore.keys()).filter(k => !k.startsWith('ip_')).length,
        rate_limited_ips: Array.from(requestStore.keys()).filter(k => k.startsWith('ip_')).length,
        server_time: new Date().toLocaleTimeString(),
        version: '2.8.0'
    });
});

// Main logging endpoint
app.post('/log', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.body.request_id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📨 [${new Date().toLocaleTimeString()}] New log request: ${requestId}`);
    
    try {
        const { data, signature, timestamp, version, request_id } = req.body;

        // Basic validation
        if (!data || !signature || !timestamp || !request_id) {
            console.log(`❌ [${requestId}] Missing fields`);
            return res.status(400).json({ 
                success: false,
                error: "Invalid request: missing required fields",
                request_id: requestId
            });
        }

        // Check for duplicate requests
        if (requestStore.has(request_id)) {
            console.log(`⚠️ [${requestId}] Duplicate request`);
            return res.status(400).json({ 
                success: false,
                error: "Duplicate request detected",
                request_id: requestId
            });
        }
        requestStore.set(request_id, Date.now());

        // IP-based rate limiting
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipKey = `ip_${ip}`;
        const ipCount = requestStore.get(ipKey) || 0;

        if (ipCount > 20) { // Increased to 20 requests
            console.log(`⏸️ [${requestId}] Rate limited IP: ${ip}`);
            return res.status(429).json({ 
                success: false,
                error: "Rate limit exceeded. Please wait before sending more logs.",
                retry_after: 60,
                request_id: requestId
            });
        }
        requestStore.set(ipKey, ipCount + 1);

        // Decrypt the data
        const decoded = customDecode(data);
        const encryptionKey = SHARED_SECRET + timestamp;
        const decrypted = xorDecrypt(decoded, encryptionKey);
        
        let payload;
        try {
            payload = JSON.parse(decrypted);
        } catch (parseError) {
            console.log(`❌ [${requestId}] JSON parse error: ${parseError.message}`);
            return res.status(400).json({ 
                success: false,
                error: "Invalid data format",
                request_id: requestId
            });
        }

        // Validate signature
        const isValid = validateSignature(payload, signature, timestamp);
        if (!isValid) {
            console.log(`❌ [${requestId}] Invalid signature`);
            return res.status(401).json({ 
                success: false,
                error: "Invalid security signature",
                request_id: requestId
            });
        }

        // Log successful decryption
        console.log(`✅ [${requestId}] Valid log from: ${payload.username} (ID: ${payload.user_id}) in ${payload.game_name}`);

        // Format for Discord
        const discordPayload = formatDiscordEmbed(payload);

        // Send to Discord webhook with 2-second delay to prevent spam
        if (DISCORD_WEBHOOK) {
            setTimeout(async () => {
                try {
                    const discordResponse = await axios.post(DISCORD_WEBHOOK, discordPayload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000 // 10 second timeout
                    });
                    
                    console.log(`📤 [${requestId}] Sent to Discord: ${discordResponse.status}`);
                } catch (discordError) {
                    console.error(`❌ [${requestId}] Discord error:`, discordError.message);
                    // Don't fail the request if Discord fails
                }
            }, 2000); // 2 second delay
        } else {
            console.warn(`⚠️ [${requestId}] No Discord webhook configured`);
        }

        const processingTime = Date.now() - startTime;
        
        res.json({ 
            success: true, 
            message: "Log processed successfully and queued for Discord",
            request_id: requestId,
            processing_time: `${processingTime}ms`,
            player: payload.username,
            game: payload.game_name,
            timestamp: new Date().toISOString()
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

// ========== ERROR HANDLING ==========
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found",
        available_endpoints: ["GET /", "GET /health", "GET /stats", "POST /log"]
    });
});

app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 VOID SECURE LOGGER STARTED`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔒 Secret: ${SHARED_SECRET ? "CONFIGURED" : "USING DEFAULT"}`);
    console.log(`🤖 Discord: ${DISCORD_WEBHOOK ? "READY" : "NOT CONFIGURED"}`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log(`=========================================`);
    
    if (!DISCORD_WEBHOOK) {
        console.error('❌ WARNING: DISCORD_WEBHOOK_URL environment variable not set!');
        console.log('ℹ️  Set it in Render Dashboard → Environment → Add:');
        console.log('   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...');
    }
    
    if (SHARED_SECRET === "V0!d_S3cur3K3y@2024#RBLX") {
        console.warn('⚠️  WARNING: Using default secret. Change SHARED_SECRET env var for production!');
    }
});// ====================================================
// VOID SECURE LOGGER + KEEP-ALIVE (COMBINED)
// ====================================================
const express = require('express');
const axios = require('axios');
const app = express();

// ========== CONFIGURATION ==========
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "V0!d_S3cur3K3y@2024#RBLX";
const PORT = process.env.PORT || 3000;

// ========== KEEP-ALIVE PING ==========
setInterval(() => {
    const now = new Date().toLocaleTimeString();
    console.log(`💓 [${now}] Keep-alive ping`);
    
    // Also log memory usage
    const used = process.memoryUsage();
    console.log(`📊 Memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 5 * 60 * 1000); // Every 5 minutes

// ========== VOID LOGGER CORE ==========
// Request store for rate limiting (in-memory for Render)
const requestStore = new Map();

// Clean old requests every 5 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of requestStore.entries()) {
        if (now - value > 5 * 60 * 1000) {
            requestStore.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} old requests`);
    }
}, 5 * 60 * 1000);

// Custom decode (matches Lua encoding)
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

// XOR decrypt (matches Lua)
function xorDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        const dataByte = data.charCodeAt(i);
        const keyByte = key.charCodeAt(i % key.length);
        result += String.fromCharCode(dataByte ^ keyByte);
    }
    return result;
}

// Validate request signature
function validateSignature(payload, signature, timestamp) {
    let dataString = "";
    Object.keys(payload).sort().forEach(key => {
        dataString += key + "=" + payload[key] + "|";
    });

    const message = SHARED_SECRET + timestamp + dataString;
    let hash = 0;

    for (let i = 0; i < message.length; i++) {
        const char = message.charCodeAt(i);
        hash ^= (char << ((i % 4) * 8));
        hash = (hash * 16777619) >>> 0;
    }

    const expectedSig = hash.toString(16).toUpperCase().padStart(8, '0');
    return expectedSig === signature;
}

// Format Discord embed
function formatDiscordEmbed(data) {
    return {
        username: "Void Execution Logger",
        avatar_url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=420&height=420&format=png`,
        embeds: [{
            title: "🎮 Execution Logged",
            color: 65280, // Green
            fields: [
                { 
                    name: "👤 Player Info", 
                    value: `**Username:** ${data.username}\n**Display:** ${data.display_name || "N/A"}\n**ID:** \`${data.user_id}\``, 
                    inline: true 
                },
                { 
                    name: "📅 Account Age", 
                    value: `\`${data.account_age}\``, 
                    inline: true 
                },
                { 
                    name: "🕐 Time", 
                    value: `${data.execution_time}\n${data.execution_date}`, 
                    inline: true 
                },
                { 
                    name: "🎯 Game Info", 
                    value: `**${data.game_name}**\nPlace ID: \`${data.place_id}\`\nServer: \`${data.server_id}\``, 
                    inline: false 
                },
                { 
                    name: "🔗 Join Link", 
                    value: `[Click to Join](${data.join_link})`, 
                    inline: true 
                },
                { 
                    name: "🆔 HWID", 
                    value: `\`${data.hwid}\``, 
                    inline: true 
                }
            ],
            thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=150&height=150&format=png`
            },
            timestamp: new Date().toISOString(),
            footer: {
                text: `Void Logger v${data.script_version || "2.8.0"} • Roblox ${data.roblox_version || "Unknown"}`
            }
        }]
    };
}

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ========== ROUTES ==========
// Health check endpoint
app.get('/', (req, res) => {
    const now = new Date().toLocaleTimeString();
    res.json({ 
        status: 'online',
        service: 'Void Secure Logger',
        version: '2.8.0',
        host: 'Render.com',
        time: now,
        uptime: `${Math.floor(process.uptime() / 60)} minutes`,
        memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        endpoints: {
            log: 'POST /log',
            health: 'GET /health',
            stats: 'GET /stats'
        },
        message: '✅ Server is running and ready to receive logs'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: requestStore.size,
        discord_webhook: DISCORD_WEBHOOK ? 'CONFIGURED' : 'MISSING',
        timestamp: new Date().toISOString()
    });
});

app.get('/stats', (req, res) => {
    res.json({
        total_requests: requestStore.size,
        active_sessions: Array.from(requestStore.keys()).filter(k => !k.startsWith('ip_')).length,
        rate_limited_ips: Array.from(requestStore.keys()).filter(k => k.startsWith('ip_')).length,
        server_time: new Date().toLocaleTimeString(),
        version: '2.8.0'
    });
});

// Main logging endpoint
app.post('/log', async (req, res) => {
    const startTime = Date.now();
    const requestId = req.body.request_id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📨 [${new Date().toLocaleTimeString()}] New log request: ${requestId}`);
    
    try {
        const { data, signature, timestamp, version, request_id } = req.body;

        // Basic validation
        if (!data || !signature || !timestamp || !request_id) {
            console.log(`❌ [${requestId}] Missing fields`);
            return res.status(400).json({ 
                success: false,
                error: "Invalid request: missing required fields",
                request_id: requestId
            });
        }

        // Check for duplicate requests
        if (requestStore.has(request_id)) {
            console.log(`⚠️ [${requestId}] Duplicate request`);
            return res.status(400).json({ 
                success: false,
                error: "Duplicate request detected",
                request_id: requestId
            });
        }
        requestStore.set(request_id, Date.now());

        // IP-based rate limiting
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipKey = `ip_${ip}`;
        const ipCount = requestStore.get(ipKey) || 0;

        if (ipCount > 20) { // Increased to 20 requests
            console.log(`⏸️ [${requestId}] Rate limited IP: ${ip}`);
            return res.status(429).json({ 
                success: false,
                error: "Rate limit exceeded. Please wait before sending more logs.",
                retry_after: 60,
                request_id: requestId
            });
        }
        requestStore.set(ipKey, ipCount + 1);

        // Decrypt the data
        const decoded = customDecode(data);
        const encryptionKey = SHARED_SECRET + timestamp;
        const decrypted = xorDecrypt(decoded, encryptionKey);
        
        let payload;
        try {
            payload = JSON.parse(decrypted);
        } catch (parseError) {
            console.log(`❌ [${requestId}] JSON parse error: ${parseError.message}`);
            return res.status(400).json({ 
                success: false,
                error: "Invalid data format",
                request_id: requestId
            });
        }

        // Validate signature
        const isValid = validateSignature(payload, signature, timestamp);
        if (!isValid) {
            console.log(`❌ [${requestId}] Invalid signature`);
            return res.status(401).json({ 
                success: false,
                error: "Invalid security signature",
                request_id: requestId
            });
        }

        // Log successful decryption
        console.log(`✅ [${requestId}] Valid log from: ${payload.username} (ID: ${payload.user_id}) in ${payload.game_name}`);

        // Format for Discord
        const discordPayload = formatDiscordEmbed(payload);

        // Send to Discord webhook with 2-second delay to prevent spam
        if (DISCORD_WEBHOOK) {
            setTimeout(async () => {
                try {
                    const discordResponse = await axios.post(DISCORD_WEBHOOK, discordPayload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000 // 10 second timeout
                    });
                    
                    console.log(`📤 [${requestId}] Sent to Discord: ${discordResponse.status}`);
                } catch (discordError) {
                    console.error(`❌ [${requestId}] Discord error:`, discordError.message);
                    // Don't fail the request if Discord fails
                }
            }, 2000); // 2 second delay
        } else {
            console.warn(`⚠️ [${requestId}] No Discord webhook configured`);
        }

        const processingTime = Date.now() - startTime;
        
        res.json({ 
            success: true, 
            message: "Log processed successfully and queued for Discord",
            request_id: requestId,
            processing_time: `${processingTime}ms`,
            player: payload.username,
            game: payload.game_name,
            timestamp: new Date().toISOString()
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

// ========== ERROR HANDLING ==========
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found",
        available_endpoints: ["GET /", "GET /health", "GET /stats", "POST /log"]
    });
});

app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 VOID SECURE LOGGER STARTED`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔒 Secret: ${SHARED_SECRET ? "CONFIGURED" : "USING DEFAULT"}`);
    console.log(`🤖 Discord: ${DISCORD_WEBHOOK ? "READY" : "NOT CONFIGURED"}`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    console.log(`=========================================`);
    
    if (!DISCORD_WEBHOOK) {
        console.error('❌ WARNING: DISCORD_WEBHOOK_URL environment variable not set!');
        console.log('ℹ️  Set it in Render Dashboard → Environment → Add:');
        console.log('   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...');
    }
    
    if (SHARED_SECRET === "V0!d_S3cur3K3y@2024#RBLX") {
        console.warn('⚠️  WARNING: Using default secret. Change SHARED_SECRET env var for production!');
    }
});
