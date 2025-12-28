// stats-routes.js - Statistics routes with GitHub storage
const express = require('express');
const axios = require('axios');

// USE GITHUB STATS MANAGER INSTEAD OF LOCAL FILE
const GitHubStatsManager = require('./github-stats-manager');
const statsManager = new GitHubStatsManager();

const statsRouter = express.Router();

function createDiscordEmbed(title, description, fields, color = 0x5865F2) {
    return {
        username: "Void Statistics Dashboard",
        embeds: [{
            title: title,
            description: description,
            color: color,
            fields: fields,
            timestamp: new Date().toISOString(),
            footer: {
                text: "Void Secure Logger • Stats Dashboard • GitHub Storage"
            }
        }]
    };
}

async function sendToDiscord(embedData) {
    const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
    if (!DISCORD_WEBHOOK) {
        throw new Error("No Discord webhook configured");
    }
    
    try {
        const response = await axios.post(DISCORD_WEBHOOK, embedData, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return { success: true, status: response.status };
    } catch (error) {
        console.error('Discord send error:', error.message);
        return { success: false, error: error.message };
    }
}

statsRouter.get('/', async (req, res) => {
    try {
        console.log('📊 Loading stats for dashboard from GitHub...');
        const stats = await statsManager.loadStats();
        const periodCounts = statsManager.getPeriodCounts(stats);
        const topGames = statsManager.getTopGames(stats, 'total', 10);
        const topUsers = statsManager.getTopUsers(stats, 'total', 10);
        
        // Show storage source
        const storageSource = stats.storage || 'unknown';
        const storageBadge = storageSource === 'github' ? '🐙 GitHub' : 
                            storageSource === 'local' ? '💾 Local' : 
                            storageSource === 'local-fallback' ? '⚠️ Local Fallback' : 
                            '❓ Unknown';
        
        const html = `<!DOCTYPE html><html><head><title>Void Statistics Dashboard</title>
        <style>:root{--primary:#5865F2;--success:#57F287;--danger:#ED4245;--warning:#FEE75C;--dark:#2C2F33;--darker:#23272A;}
        *{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;background:var(--darker);color:white;line-height:1.6;padding:20px;}
        .container{max-width:1200px;margin:0 auto;}header{text-align:center;margin-bottom:30px;padding:20px;background:var(--dark);border-radius:10px;border-left:5px solid var(--primary);}
        .storage-badge{display:inline-block;background:#24292e;color:white;padding:5px 10px;border-radius:3px;font-family:monospace;margin-left:10px;font-size:0.9em;}
        .storage-local{background:#5865F2;}
        .storage-fallback{background:#f59e0b;color:#000;}
        .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin-bottom:30px;}
        .stat-card{background:var(--dark);padding:20px;border-radius:8px;text-align:center;transition:transform 0.3s;}
        .stat-card:hover{transform:translateY(-5px);}.stat-value{font-size:2.5em;font-weight:bold;margin:10px 0;}
        .stat-label{color:#b9bbbe;font-size:0.9em;text-transform:uppercase;letter-spacing:1px;}
        .btn-group{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0;justify-content:center;}
        .btn{padding:12px 24px;background:var(--primary);color:white;border:none;border-radius:5px;cursor:pointer;font-weight:bold;text-decoration:none;display:inline-block;transition:all 0.3s;}
        .btn:hover{background:#4752C4;transform:scale(1.05);}.btn-success{background:var(--success);}.btn-success:hover{background:#43B581;}
        .btn-danger{background:var(--danger);}.btn-danger:hover{background:#DA373C;}.btn-warning{background:var(--warning);color:#000;}.btn-warning:hover{background:#D6B91C;}
        .tables-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:20px;margin-top:30px;}
        .table-card{background:var(--dark);border-radius:8px;padding:20px;}.table-title{margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid var(--primary);}
        table{width:100%;border-collapse:collapse;}th{text-align:left;padding:10px;background:rgba(88,101,242,0.1);color:#b9bbbe;}
        td{padding:10px;border-bottom:1px solid rgba(255,255,255,0.1);}tr:hover{background:rgba(255,255,255,0.05);}.rank{width:40px;text-align:center;font-weight:bold;}
        .success-message{background:rgba(87,242,135,0.1);border:1px solid var(--success);color:var(--success);padding:15px;border-radius:5px;margin:20px 0;text-align:center;}
        .error-message{background:rgba(237,66,69,0.1);border:1px solid var(--danger);color:var(--danger);padding:15px;border-radius:5px;margin:20px 0;text-align:center;}
        .last-updated{text-align:center;margin-top:30px;color:#72767d;font-size:0.9em;}
        .github-link{color:#58a6ff;text-decoration:none;}
        .empty-data{text-align:center;color:#72767d;padding:20px;font-style:italic;}
        </style></head>
        <body><div class="container"><header><h1>📊 Void Statistics Dashboard</h1>
        <p class="subtitle">Track execution statistics and send reports to Discord</p>
        <p><strong>Storage:</strong> <span class="storage-badge ${storageSource === 'github' ? '' : storageSource === 'local-fallback' ? 'storage-fallback' : 'storage-local'}">${storageBadge}</span></p>
        <p><strong>Started:</strong> ${new Date(stats.start_date).toLocaleDateString()}</p>
        <p><strong>Last Updated:</strong> ${stats.last_updated ? new Date(stats.last_updated).toLocaleString() : 'Never'}</p>
        ${storageSource === 'local-fallback' ? '<p style="color:#f59e0b;font-size:0.9em;">⚠️ Using local fallback - GitHub connection failed</p>' : ''}
        </header>
        ${req.query.success === 'true' ? '<div class="success-message">✅ Report sent to Discord successfully!</div>' : 
         req.query.error ? `<div class="error-message">❌ Error: ${req.query.error}</div>` : ''}
        <div class="stats-grid">
        <div class="stat-card" style="border-left:4px solid var(--primary);"><div class="stat-label">Total Executions</div><div class="stat-value">${periodCounts.total.toLocaleString()}</div></div>
        <div class="stat-card" style="border-left:4px solid var(--success);"><div class="stat-label">Today</div><div class="stat-value">${periodCounts.daily.toLocaleString()}</div></div>
        <div class="stat-card" style="border-left:4px solid var(--warning);"><div class="stat-label">This Week</div><div class="stat-value">${periodCounts.weekly.toLocaleString()}</div></div>
        <div class="stat-card" style="border-left:4px solid var(--danger);"><div class="stat-label">This Month</div><div class="stat-value">${periodCounts.monthly.toLocaleString()}</div></div>
        </div>
        <div class="btn-group">
        <a href="/stats/send-report?period=daily" class="btn btn-success">📊 Send Daily Report</a>
        <a href="/stats/send-report?period=weekly" class="btn btn-warning">📈 Send Weekly Report</a>
        <a href="/stats/send-report?period=monthly" class="btn btn-danger">📉 Send Monthly Report</a>
        <a href="/stats/send-report?period=yearly" class="btn">📅 Send Yearly Report</a>
        <a href="/stats/send-report?period=total" class="btn" style="background:#9C27B0;">🏆 Send All-Time Report</a>
        <a href="/stats/reset-data" class="btn" style="background:#607D8B;" onclick="return confirm('⚠️ WARNING: This will reset ALL statistics in GitHub!\\n\\nThis action cannot be undone.\\n\\nAre you sure?')">🔄 Reset Data</a>
        </div>
        <div class="tables-grid">
        <div class="table-card"><h3 class="table-title">🎮 Top Games (All Time)</h3>
        <table><thead><tr><th class="rank">#</th><th>Game Name</th><th>Executions</th></tr></thead><tbody>
        ${topGames.length > 0 ? topGames.map((game,index)=>`<tr><td class="rank">${index+1}</td><td>${game.game}</td><td>${game.count.toLocaleString()}</td></tr>`).join('') : 
        '<tr><td colspan="3" class="empty-data">No games recorded yet</td></tr>'}
        </tbody></table></div>
        <div class="table-card"><h3 class="table-title">👥 Top Users (All Time)</h3>
        <table><thead><tr><th class="rank">#</th><th>Username</th><th>User ID</th><th>Executions</th></tr></thead><tbody>
        ${topUsers.length > 0 ? topUsers.map((user,index)=>`<tr><td class="rank">${index+1}</td><td>${user.username}</td><td><code>${user.user_id}</code></td><td>${user.count.toLocaleString()}</td></tr>`).join('') : 
        '<tr><td colspan="4" class="empty-data">No users recorded yet</td></tr>'}
        </tbody></table></div></div>
        <div class="last-updated">
        <p>
            Last updated: ${new Date().toLocaleTimeString()} | 
            <a href="/" style="color:#7289DA;">← Back to Main</a> | 
            ${process.env.GITHUB_TOKEN ? '<a href="/github-status" class="github-link">🐙 GitHub Status</a> | ' : ''}
            <a href="/stats" style="color:#7289DA;">🔄 Refresh</a>
        </p>
        ${storageSource === 'github' ? 
            `<p style="font-size:0.8em;color:#58a6ff;">
                <a href="https://github.com/${process.env.GITHUB_REPO_OWNER || 'your-username'}/${process.env.GITHUB_REPO_NAME || 'void-secure-logger-stats'}/blob/main/${process.env.GITHUB_FILE_PATH || 'execution-stats.json'}" 
                   target="_blank" class="github-link">
                   📁 View raw JSON on GitHub
                </a>
            </p>` : ''}
        </div>
        </div>
        <script>
            // Auto-refresh every 60 seconds
            setTimeout(() => {
                window.location.href = '/stats';
            }, 60000);
            
            // Add loading indicator for reset
            document.querySelector('a[href*="reset-data"]')?.addEventListener('click', function(e) {
                if (confirm(this.getAttribute('onclick').match(/confirm\('([^']+)'/)[1])) {
                    this.innerHTML = '🔄 Resetting...';
                    this.style.opacity = '0.7';
                    this.style.pointerEvents = 'none';
                } else {
                    e.preventDefault();
                }
            });
        </script></body></html>`;
        
        res.send(html);
    } catch (error) {
        console.error('Stats page error:', error);
        res.status(500).send(`<div style="background:#ED4245;color:white;padding:20px;border-radius:5px;">
        <h1>❌ Error Loading Statistics</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Storage:</strong> GitHub Stats Manager</p>
        <div style="margin-top:15px;">
            <a href="/stats" style="color:white;text-decoration:underline;margin-right:15px;">Try Again</a> | 
            <a href="/github-status" style="color:white;text-decoration:underline;margin-right:15px;">Check GitHub Status</a> | 
            <a href="/" style="color:white;text-decoration:underline;">Back to Main</a>
        </div>
        </div>`);
    }
});

statsRouter.get('/send-report', async (req, res) => {
    const period = req.query.period || 'daily';
    const periodNames = {daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly',total:'All-Time'};
    
    try {
        console.log(`📨 Generating ${period} report for Discord...`);
        const stats = await statsManager.loadStats();
        const periodCounts = statsManager.getPeriodCounts(stats);
        const topGames = statsManager.getTopGames(stats, period === 'total' ? 'total' : period, 10);
        const topUsers = statsManager.getTopUsers(stats, period === 'total' ? 'total' : period, 5);
        
        const fields = [
            {name:"📊 Executions",value:`\`\`\`${periodCounts[period === 'total' ? 'total' : period].toLocaleString()}\`\`\``,inline:true},
            {name:"📅 Period",value:`\`\`\`${periodNames[period]}\`\`\``,inline:true},
            {name:"📈 Total (All Time)",value:`\`\`\`${periodCounts.total.toLocaleString()}\`\`\``,inline:true},
            {name:"🏆 Top Game",value:`\`\`\`${topGames[0]?.game || 'None'}\`\`\``,inline:true},
            {name:"👑 Top User",value:`\`\`\`${topUsers[0]?.username || 'None'}\`\`\``,inline:true},
            {name:"🎮 Unique Games",value:`\`\`\`${Object.keys(stats.games || {}).length}\`\`\``,inline:true}
        ];
        
        if (topGames.length > 0) {
            const gamesText = topGames.map((game, index) => 
                `${index + 1}. **${game.game}** - ${game.count} executions`
            ).join('\n');
            fields.push({name:`🎮 Top Games (${periodNames[period]})`,value:gamesText.length>1000?gamesText.substring(0,1000)+'...':gamesText,inline:false});
        }
        
        if (topUsers.length > 0) {
            const usersText = topUsers.map((user, index) => 
                `${index + 1}. **${user.username}** (${user.user_id}) - ${user.count} executions`
            ).join('\n');
            fields.push({name:`👥 Top Users (${periodNames[period]})`,value:usersText.length>1000?usersText.substring(0,1000)+'...':usersText,inline:false});
        }
        
        // Add storage info
        fields.push({
            name:"💾 Storage",
            value:`\`\`\`${stats.storage || 'local'} • ${new Date(stats.last_updated).toLocaleDateString()}\`\`\``,
            inline:false
        });
        
        const embedData = createDiscordEmbed(
            `📊 ${periodNames[period]} Execution Report`,
            `Statistics report for ${periodNames[period].toLowerCase()} executions\nGenerated from GitHub storage`,
            fields,
            period === 'daily' ? 0x57F287 : 
            period === 'weekly' ? 0xFEE75C : 
            period === 'monthly' ? 0xED4245 : 
            period === 'yearly' ? 0x5865F2 : 0x9C27B0
        );
        
        const result = await sendToDiscord(embedData);
        if (result.success) {
            console.log(`✅ ${period} report sent to Discord`);
            res.redirect('/stats?success=true');
        } else {
            console.error(`❌ Failed to send ${period} report:`, result.error);
            res.redirect(`/stats?error=${encodeURIComponent(result.error)}`);
        }
    } catch (error) {
        console.error('Send report error:', error);
        res.redirect(`/stats?error=${encodeURIComponent(error.message)}`);
    }
});

statsRouter.get('/reset-data', async (req, res) => {
    try {
        console.log('🔄 Resetting statistics data...');
        const initialStats = statsManager.createInitialStats();
        await statsManager.saveStats(initialStats);
        console.log('✅ Statistics reset successfully');
        res.redirect('/stats?success=true');
    } catch (error) {
        console.error('❌ Reset data error:', error);
        res.redirect(`/stats?error=${encodeURIComponent(error.message)}`);
    }
});

// Add a debug endpoint to see raw stats
statsRouter.get('/debug', async (req, res) => {
    try {
        const stats = await statsManager.loadStats();

        const periodCounts = statsManager.getPeriodCounts(stats);
        res.json({
            success: true,
            storage: stats.storage || 'unknown',
            total_executions: stats.total_executions || 0,
            daily: periodCounts.daily,
            weekly: periodCounts.weekly,
            monthly: periodCounts.monthly,
            games_count: Object.keys(stats.games || {}).length,
            users_count: Object.keys(stats.users || {}).length,
            last_updated: stats.last_updated || 'never',
            sample_games: statsManager.getTopGames(stats, 'total', 3),
            sample_users: statsManager.getTopUsers(stats, 'total', 3)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = statsRouter;
