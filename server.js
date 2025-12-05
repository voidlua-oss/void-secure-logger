// server.js - FIXED VERSION
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
console.log('🔐 Secret:', SHARED_SECRET ? 'SET' : 'USING DEFAULT');

// ========== MIDDLEWARE ==========
app.use(express.json());

// ========== ROUTES ==========

// GET / - Homepage with instructions
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Void Secure Logger</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; }
            code { background: #eee; padding: 2px 5px; }
        </style>
    </head>
    <body>
        <h1>🚀 Void Secure Logger</h1>
        <p><strong>Status:</strong> ✅ Online</p>
        <p><strong>Version:</strong> 3.1.0</p>
        <p><strong>Discord Webhook:</strong> ${DISCORD_WEBHOOK ? '✅ Configured' : '❌ Not Configured'}</p>
        
        <h2>📡 Endpoints:</h2>
        
        <div class="endpoint">
            <h3>GET <code>/</code></h3>
            <p>This page - shows server status</p>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/health</code></h3>
            <p>Health check endpoint</p>
            <a href="/health">Test Health</a>
        </div>
        
        <div class="endpoint">
            <h3>GET <code>/test-discord</code></h3>
            <p>Test Discord webhook connection</p>
            <a href="/test-discord">Test Discord</a>
        </div>
        
        <div class="endpoint">
            <h3>POST <code>/log</code> (MAIN ENDPOINT)</h3>
            <p>Accepts encrypted logs from Roblox Lua scripts</p>
            <p><em>This endpoint only accepts POST requests</em></p>
        </div>
        
        <h2>🔧 Quick Test:</h2>
        <form id="testForm">
            <input type="text" id="message" placeholder="Test message" value="Hello from browser">
            <button type="submit">Send Test to Discord</button>
        </form>
        
        <script>
            document.getElementById('testForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const message = document.getElementById('message').value;
                
                try {
                    const response = await fetch('/test-discord');
                    const result = await response.json();
                    alert(result.message || 'Test sent!');
                } catch (error) {
                    alert('Error: ' + error.message);
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// GET /health - Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'Void Logger',
        version: '3.1.0',
        timestamp: new Date().toISOString(),
        discord_configured: !!DISCORD_WEBHOOK,
        uptime: process.uptime()
    });
});

// GET /test-discord - Test Discord connection
app.get('/test-discord', async (req, res) => {
    if (!DISCORD_WEBHOOK) {
        return res.status(400).json({ 
            error: 'No Discord webhook configured',
            fix: 'Set DISCORD_WEBHOOK_URL environment variable on Render'
        });
    }
    
    try {
        console.log('🔄 Testing Discord webhook...');
        
        const embed = {
            username: "Void Logger",
            embeds: [{
                title: "🟢 WEBHOOK TEST",
                description: "This is a test message from your Render server",
                color: 65280, // Green
                fields: [
                    { name: "Status", value: "✅ Working", inline: true },
                    { name: "Time", value: new Date().toLocaleTimeString(), inline: true },
                    { name: "Server", value: "Render.com", inline: true }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "Void Logger Test" }
            }]
        };
        
        const response = await axios.post(DISCORD_WEBHOOK, embed, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log(`✅ Discord test success: ${response.status}`);
        
        res.json({ 
            success: true, 
            message: 'Test sent to Discord successfully',
            status_code: response.status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Discord test failed:', error.message);
        
        let errorDetails = error.message;
        if (error.response) {
            errorDetails += ` - Status: ${error.response.status}`;
            if (error.response.data) {
                errorDetails += ` - Data: ${JSON.stringify(error.response.data)}`;
            }
        }
        
        res.status(500).json({ 
            error: 'Failed to send to Discord',
            details: errorDetails,
            fix: 'Check your webhook URL in Render environment variables'
        });
    }
});

// GET /log - Show info page (for debugging)
app.get('/log', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Void Logger - /log Endpoint</title></head>
    <body>
        <h1>📝 /log Endpoint</h1>
        <p><strong>This endpoint only accepts POST requests!</strong></p>
        <p>It receives encrypted logs from Roblox Lua scripts.</p>
        <p>To test, use curl or Postman:</p>
        <pre>
curl -X POST https://void-secure-logger.onrender.com/log \\
  -H "Content-Type: application/json" \\
  -d '{"test":"data"}'
        </pre>
        <p><a href="/">← Back to Home</a></p>
    </body>
    </html>
    `;
    res.send(html);
});

// POST /log - Main logging endpoint (Lua scripts send here)
app.post('/log', async (req, res) => {
    console.log('📨 Received POST to /log endpoint');
    console.log('Request IP:', req.ip);
    console.log('Request headers:', req.headers['user-agent']);
    
    try {
        const { data, signature, timestamp, request_id } = req.body;
        
        // Log request (without sensitive data)
        console.log('📦 Request metadata:', {
            has_data: !!data,
            data_length: data ? data.length : 0,
            has_signature: !!signature,
            has_timestamp: !!timestamp,
            request_id: request_id || 'none'
        });
        
        if (!data || !timestamp) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                success: false, 
                error: "Missing required fields (data, timestamp)" 
            });
        }
        
        // DECRYPTION (simplified for debugging)
        console.log('🔓 Attempting decryption...');
        
        let payload;
        try {
            // Custom decode
            let decoded = "";
            for (let i = 0; i < data.length; i += 3) {
                const charCode = parseInt(data.substr(i, 3));
                if (!isNaN(charCode)) {
                    decoded += String.fromCharCode(charCode);
                }
            }
            
            // XOR decrypt
            const encryptionKey = SHARED_SECRET + timestamp;
            let decrypted = "";
            for (let i = 0; i < decoded.length; i++) {
                const dataByte = decoded.charCodeAt(i);
                const keyByte = encryptionKey.charCodeAt(i % encryptionKey.length);
                decrypted += String.fromCharCode(dataByte ^ keyByte);
            }
            
            payload = JSON.parse(decrypted);
            console.log('✅ Decryption successful!');
            console.log('👤 User:', payload.username);
            console.log('🎮 Game:', payload.game_name);
            
        } catch (decryptError) {
            console.error('❌ Decryption failed:', decryptError.message);
            console.log('Raw data (first 100 chars):', data ? data.substring(0, 100) : 'none');
            
            // Try to accept simple test payloads
            if (typeof req.body === 'object' && req.body.username) {
                console.log('⚠️ Using raw payload (test mode)');
                payload = req.body;
            } else {
                return res.status(400).json({ 
                    success: false, 
                    error: "Decryption failed",
                    hint: "Check encryption/decryption keys match" 
                });
            }
        }
        
        // FORWARD TO DISCORD
        if (DISCORD_WEBHOOK && payload) {
            console.log('📤 Forwarding to Discord...');
            
            try {
                const discordPayload = {
                    username: "Void Logger",
                    embeds: [{
                        title: "🎮 Execution Logged",
                        color: 16711680, // Red
                        fields: [
                            { name: "👤 Username", value: payload.username || "Unknown", inline: true },
                            { name: "🆔 User ID", value: payload.user_id ? `\`${payload.user_id}\`` : "Unknown", inline: true },
                            { name: "📅 Account Age", value: payload.account_age || "Unknown", inline: true },
                            { name: "🎯 Game", value: payload.game_name || "Roblox Game", inline: false },
                            { name: "🆔 HWID", value: payload.hwid ? `\`${payload.hwid}\`` : "Unknown", inline: false },
                            { name: "⏰ Time", value: payload.execution_time || new Date().toLocaleTimeString(), inline: true }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: { text: `Void Logger v${payload.script_version || "3.1.0"}` }
                    }]
                };
                
                console.log('Sending Discord payload:', JSON.stringify(discordPayload, null, 2));
                
                const discordResponse = await axios.post(DISCORD_WEBHOOK, discordPayload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000
                });
                
                console.log(`✅ Discord success: ${discordResponse.status}`);
                
            } catch (discordError) {
                console.error('❌ Discord error:', discordError.message);
                if (discordError.response) {
                    console.error('Discord response:', discordError.response.status);
                    console.error('Discord data:', discordError.response.data);
                }
                // Don't fail the request - still return success to Lua
            }
        } else if (!DISCORD_WEBHOOK) {
            console.warn('⚠️ No Discord webhook configured - skipping Discord');
        }
        
        // SUCCESS RESPONSE TO LUA
        res.json({ 
            success: true, 
            message: "Log processed successfully",
            request_id: request_id || 'none',
            discord_sent: !!DISCORD_WEBHOOK,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Server error:', error.message);
        console.error(error.stack);
        
        res.status(500).json({ 
            success: false,
            error: "Internal server error",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 VOID LOGGER STARTED`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: https://void-secure-logger.onrender.com`);
    console.log(`🤖 Discord: ${DISCORD_WEBHOOK ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
    console.log(`🔗 Test: https://void-secure-logger.onrender.com/test-discord`);
    console.log(`=========================================`);
    
    if (!DISCORD_WEBHOOK) {
        console.error('\n❌ CRITICAL: No Discord webhook configured!');
        console.log('💡 Fix: Go to Render Dashboard → Environment → Add:');
        console.log('   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...\n');
    }
});
