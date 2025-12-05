// server.js - DEBUG VERSION
const express = require('express');
const axios = require('axios');
const app = express();

// ========== CONFIGURATION ==========
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const SHARED_SECRET = process.env.SHARED_SECRET || "V0!d_S3cur3K3y@2024#RBLX";
const PORT = process.env.PORT || 3000;

// ========== LOGGING ==========
console.log('🔧 Starting Void Logger...');
console.log('🌐 Discord Webhook:', DISCORD_WEBHOOK ? 'SET' : 'NOT SET');
console.log('🔐 Secret:', SHARED_SECRET);

// ========== SIMPLIFIED FUNCTIONS ==========
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

// ========== MIDDLEWARE ==========
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// ========== ROUTES ==========
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Void Logger',
        discord_configured: !!DISCORD_WEBHOOK,
        time: new Date().toISOString()
    });
});

// TEST ENDPOINT - Send test to Discord
app.get('/test-discord', async (req, res) => {
    if (!DISCORD_WEBHOOK) {
        return res.json({ error: 'No Discord webhook configured' });
    }
    
    try {
        const testEmbed = {
            username: "Void Logger Test",
            embeds: [{
                title: "🟢 TEST MESSAGE",
                description: "This is a test from your Render server",
                color: 65280,
                timestamp: new Date().toISOString(),
                fields: [
                    { name: "Status", value: "✅ Working", inline: true },
                    { name: "Time", value: new Date().toLocaleTimeString(), inline: true },
                    { name: "Server", value: "Render.com", inline: true }
                ]
            }]
        };
        
        console.log('Sending test to Discord...');
        const response = await axios.post(DISCORD_WEBHOOK, testEmbed, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('✅ Discord response:', response.status, response.statusText);
        res.json({ 
            success: true, 
            message: 'Test sent to Discord',
            status: response.status 
        });
        
    } catch (error) {
        console.error('❌ Discord error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        res.status(500).json({ 
            error: 'Failed to send to Discord',
            message: error.message 
        });
    }
});

// MAIN LOGGING ENDPOINT
app.post('/log', async (req, res) => {
    console.log('📨 Received log request');
    console.log('Request body keys:', Object.keys(req.body));
    
    try {
        const { data, signature, timestamp, request_id } = req.body;
        
        if (!data) {
            console.log('❌ No data in request');
            return res.status(400).json({ error: "No data" });
        }
        
        // Decrypt the data
        console.log('Decrypting data...');
        const decoded = customDecode(data);
        const encryptionKey = SHARED_SECRET + timestamp;
        const decrypted = xorDecrypt(decoded, encryptionKey);
        
        let payload;
        try {
            payload = JSON.parse(decrypted);
            console.log('✅ Decrypted payload:', {
                username: payload.username,
                user_id: payload.user_id,
                game: payload.game_name
            });
        } catch (e) {
            console.log('❌ Failed to parse JSON:', e.message);
            console.log('Raw decrypted:', decrypted);
            return res.status(400).json({ error: "Invalid data format" });
        }
        
        // Send to Discord
        if (DISCORD_WEBHOOK) {
            console.log('📤 Forwarding to Discord...');
            
            const discordEmbed = {
                username: "Void Logger",
                embeds: [{
                    title: "🎮 Execution Logged",
                    color: 16711680,
                    fields: [
                        { name: "👤 User", value: `${payload.username} (${payload.user_id})`, inline: true },
                        { name: "📛 Display", value: payload.display_name || "N/A", inline: true },
                        { name: "📅 Account Age", value: payload.account_age || "Unknown", inline: true },
                        { name: "🎯 Game", value: payload.game_name || "Unknown", inline: false },
                        { name: "🆔 HWID", value: `\`${payload.hwid || "Unknown"}\``, inline: false },
                        { name: "⏰ Time", value: payload.execution_time || new Date().toLocaleTimeString(), inline: true }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: `Void Logger v${payload.script_version || "3.1.0"}` }
                }]
            };
            
            try {
                const discordResponse = await axios.post(DISCORD_WEBHOOK, discordEmbed, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
                
                console.log(`✅ Discord: ${discordResponse.status} ${discordResponse.statusText}`);
                
            } catch (discordError) {
                console.error('❌ Discord send failed:', discordError.message);
                if (discordError.response) {
                    console.error('Discord response:', discordError.response.status, discordError.response.data);
                }
                // Don't fail the request - still return success to Lua
            }
        } else {
            console.warn('⚠️ No Discord webhook configured');
        }
        
        res.json({ 
            success: true, 
            message: "Log processed",
            forwarded_to_discord: !!DISCORD_WEBHOOK
        });
        
    } catch (error) {
        console.error('💥 Server error:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: "Server error" });
    }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📊 Test Discord: https://void-secure-logger.onrender.com/test-discord`);
    console.log(`📝 Log endpoint: POST https://void-secure-logger.onrender.com/log`);
});
