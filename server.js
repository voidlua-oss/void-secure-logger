// server.js - VOID LOGGER (FIXED VERSION)
const express = require('express');
const axios = require('axios');
const app = express();

// ========== CONFIGURATION ==========
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "V0!d_S3cur3K3y@2024#RBLX";
const PORT = process.env.PORT || 3000;

// ========== KEEP-ALIVE PING ==========
setInterval(() => {
    console.log(`💓 Keep-alive ping: ${new Date().toLocaleTimeString()}`);
}, 5 * 60 * 1000);

// ========== VOID LOGGER CORE ==========
const requestStore = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requestStore.entries()) {
        if (now - value > 5 * 60 * 1000) {
            requestStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

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

function formatDiscordEmbed(data) {
    return {
        username: "Void Logger",
        avatar_url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=150&height=150`,
        embeds: [{
            title: "🎮 Execution Logged",
            color: 65280,
            fields: [
                { 
                    name: "👤 Player", 
                    value: `**${data.username}**\nID: \`${data.user_id}\``, 
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
                    name: "🎯 Game", 
                    value: `**${data.game_name}**\nServer: \`${data.server_id}\``, 
                    inline: false 
                },
                { 
                    name: "🔗 Join", 
                    value: `[Click Here](${data.join_link})`, 
                    inline: true 
                }
            ],
            thumbnail: {
                url: `https://www.roblox.com/headshot-thumbnail/image?userId=${data.user_id}&width=150&height=150`
            },
            timestamp: new Date().toISOString(),
            footer: {
                text: `Void Logger v${data.script_version}`
            }
        }]
    };
}

// ========== MIDDLEWARE ==========
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// ========== ROUTES ==========
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Void Secure Logger',
        version: '3.0.0'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime()
    });
});

app.post('/log', async (req, res) => {
    try {
        const { data, signature, timestamp, request_id } = req.body;

        if (!data || !signature || !timestamp || !request_id) {
            return res.status(400).json({ error: "Missing fields" });
        }

        if (requestStore.has(request_id)) {
            return res.status(400).json({ error: "Duplicate request" });
        }
        requestStore.set(request_id, Date.now());

        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        const ipKey = `ip_${ip}`;
        const ipCount = requestStore.get(ipKey) || 0;

        if (ipCount > 20) {
            return res.status(429).json({ error: "Rate limited" });
        }
        requestStore.set(ipKey, ipCount + 1);

        const decoded = customDecode(data);
        const encryptionKey = SHARED_SECRET + timestamp;
        const decrypted = xorDecrypt(decoded, encryptionKey);
        const payload = JSON.parse(decrypted);

        if (!validateSignature(payload, signature, timestamp)) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        console.log(`📨 Log from: ${payload.username} in ${payload.game_name}`);

        if (DISCORD_WEBHOOK) {
            setTimeout(async () => {
                try {
                    const discordPayload = formatDiscordEmbed(payload);
                    await axios.post(DISCORD_WEBHOOK, discordPayload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    });
                } catch (discordError) {
                    console.error('Discord error:', discordError.message);
                }
            }, 2000);
        }

        res.json({ 
            success: true, 
            message: "Log processed"
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: "Server error" });
    }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 VOID LOGGER STARTED`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔐 Secret: ${SHARED_SECRET ? "SET" : "DEFAULT"}`);
    console.log(`🤖 Discord: ${DISCORD_WEBHOOK ? "READY" : "NOT SET"}`);
    console.log(`=========================================`);
});
