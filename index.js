// Void Secure Logger API for Render.com
const express = require('express');
const axios = require('axios');
const app = express();

// Configuration
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "VOID_SECURE_KEY_2024";
const PORT = process.env.PORT || 3000;

// Request store for rate limiting (in-memory for Render)
const requestStore = new Map();

// Clean old requests every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requestStore.entries()) {
        if (now - value > 5 * 60 * 1000) {
            requestStore.delete(key);
        }
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
        embeds: [{
            title: "🎮 Execution Logged",
            color: 16711680,
            fields: [
                { name: "👤 User ID", value: "```" + data.user_id + "```", inline: true },
                { name: "📛 Username", value: "```" + data.username + "```", inline: true },
                { name: "📅 Account Age", value: "```" + data.account_age + "```", inline: true },
                { name: "🎯 Game", value: "```" + data.game_name + "```", inline: true },
                { name: "🆔 Server ID", value: "```" + data.server_id + "```", inline: true },
                { name: "🔗 Join Link", value: data.join_link, inline: false },
                { name: "🆔 HWID", value: "```" + data.hwid + "```", inline: false }
            ],
            thumbnail: {
                url: "https://www.roblox.com/headshot-thumbnail/image?userId=" + 
                     data.user_id + 
                     "&width=420&height=420&format=png"
            },
            timestamp: new Date(data.timestamp * 1000).toISOString(),
            footer: {
                text: "Void Logger • " + (data.execution_time || new Date().toLocaleTimeString())
            }
        }]
    };
}

// Middleware
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

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Void Secure Logger API',
        version: '2.8.0',
        host: 'Render.com',
        endpoints: {
            log: 'POST /log',
            health: 'GET /health'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: requestStore.size
    });
});

// Main logging endpoint
app.post('/log', async (req, res) => {
    try {
        const { data, signature, timestamp, version, request_id } = req.body;

        // Basic validation
        if (!data || !signature || !timestamp || !request_id) {
            return res.status(400).json({ error: "Invalid request: missing fields" });
        }

        // Check for duplicate requests
        if (requestStore.has(request_id)) {
            return res.status(400).json({ error: "Duplicate request" });
        }
        requestStore.set(request_id, Date.now());

        // IP-based rate limiting
        const ip = req.ip;
        const ipKey = `ip_${ip}`;
        const ipCount = requestStore.get(ipKey) || 0;

        if (ipCount > 15) {
            return res.status(429).json({ 
                error: "Rate limit exceeded",
                retry_after: 300
            });
        }
        requestStore.set(ipKey, ipCount + 1);

        // Decrypt the data
        const decoded = customDecode(data);
        const encryptionKey = SHARED_SECRET + timestamp;
        const decrypted = xorDecrypt(decoded, encryptionKey);
        const payload = JSON.parse(decrypted);

        // Validate signature
        const isValid = validateSignature(payload, signature, timestamp);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        // Format for Discord
        const discordPayload = formatDiscordEmbed(payload);

        // Send to Discord webhook
        await axios.post(DISCORD_WEBHOOK, discordPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        res.json({ 
            success: true, 
            message: "Logged to Discord successfully"
        });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ 
            success: false,
            error: "Internal server error"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Void Logger running on Render (Port: ${PORT})`);
    console.log(`🔒 Webhook: ${DISCORD_WEBHOOK ? 'SET' : 'NOT SET (check env vars)'}`);
    
    if (!DISCORD_WEBHOOK) {
        console.error('❌ ERROR: DISCORD_WEBHOOK_URL environment variable not set!');
    }
});
