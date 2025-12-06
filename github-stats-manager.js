// github-stats-manager.js
const axios = require('axios');
const crypto = require('crypto');

class GitHubStatsManager {
    constructor() {
        this.validateConfig();
        this.setupGitHubAPI();
        this.cache = null;
        this.cacheTime = 0;
        this.CACHE_TTL = 30000; // 30 seconds
    }

    validateConfig() {
        this.token = process.env.GITHUB_TOKEN;
        this.owner = process.env.GITHUB_REPO_OWNER;
        this.repo = process.env.GITHUB_REPO_NAME || 'void-secure-logger-stats';
        this.branch = process.env.GITHUB_BRANCH || 'main';
        this.filePath = process.env.GITHUB_FILE_PATH || 'execution-stats.json';
        
        if (!this.token) {
            console.warn('⚠️ GITHUB_TOKEN not set, using local fallback mode');
            this.useGitHub = false;
        } else {
            this.useGitHub = true;
        }
        
        console.log(`🔐 GitHub Stats: ${this.useGitHub ? '✅ ENABLED' : '⚠️ LOCAL FALLBACK'}`);
        if (this.useGitHub) {
            console.log(`   Owner: ${this.owner || 'not-set'}`);
            console.log(`   Repo: ${this.repo}`);
            console.log(`   File: ${this.filePath}`);
        }
    }

    setupGitHubAPI() {
        if (!this.useGitHub) return;
        
        this.apiBase = `https://api.github.com/repos/${this.owner}/${this.repo}`;
        this.fileUrl = `${this.apiBase}/contents/${this.filePath}`;
        this.rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.filePath}`;
        
        this.headers = {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Void-Secure-Logger/3.2.1'
        };
    }

    async getFileSHA() {
        if (!this.useGitHub) return null;
        
        try {
            const response = await axios.get(this.fileUrl, {
                headers: this.headers,
                params: { ref: this.branch }
            });
            return response.data.sha;
        } catch (error) {
            if (error.response?.status === 404) {
                return null; // File doesn't exist yet
            }
            throw error;
        }
    }

    createInitialStats() {
        return {
            total_executions: 0,
            daily: this.createPeriodObject(),
            weekly: this.createPeriodObject(),
            monthly: this.createPeriodObject(),
            yearly: this.createPeriodObject(),
            executions: [],
            games: {},
            users: {},
            start_date: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            storage: this.useGitHub ? 'github' : 'local'
        };
    }

    createPeriodObject() {
        return {
            executions: 0,
            top_games: {},
            top_users: {},
            start_date: new Date().toISOString()
        };
    }

    async loadStats() {
        // Check cache first
        if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
            return this.cache;
        }

        if (!this.useGitHub) {
            console.log('📥 Using local fallback stats (no GitHub token)');
            this.cache = this.createInitialStats();
            this.cacheTime = Date.now();
            return this.cache;
        }

        try {
            console.log('📥 Loading stats from GitHub...');
            
            const response = await axios.get(this.fileUrl, {
                headers: this.headers,
                params: { ref: this.branch }
            });

            const content = Buffer.from(response.data.content, 'base64').toString('utf8');
            const stats = JSON.parse(content);
            
            // Ensure storage field exists
            stats.storage = 'github';
            stats.last_updated = stats.last_updated || new Date().toISOString();
            
            this.cache = stats;
            this.cacheTime = Date.now();
            
            console.log(`✅ GitHub stats loaded: ${stats.total_executions || 0} executions`);
            return stats;
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 Creating new stats file on GitHub...');
                const initialStats = this.createInitialStats();
                await this.saveStats(initialStats);
                return initialStats;
            }
            
            console.error('❌ Failed to load from GitHub:', error.message);
            console.log('🔄 Falling back to local stats');
            const localStats = this.createInitialStats();
            localStats.storage = 'local-fallback';
            return localStats;
        }
    }

    async saveStats(stats) {
        stats.last_updated = new Date().toISOString();
        stats.storage = this.useGitHub ? 'github' : 'local';
        
        if (!this.useGitHub) {
            console.log(`💾 Stats saved locally (GitHub not configured): ${stats.total_executions} executions`);
            this.cache = stats;
            this.cacheTime = Date.now();
            return stats;
        }

        try {
            const sha = await this.getFileSHA();
            const content = Buffer.from(JSON.stringify(stats, null, 2)).toString('base64');
            
            const commitMessage = this.generateCommitMessage(stats);
            
            const payload = {
                message: commitMessage,
                content: content,
                sha: sha,
                branch: this.branch,
                committer: {
                    name: 'Void Secure Logger',
                    email: 'stats@void-secure-logger.com'
                }
            };

            console.log(`💾 Saving stats to GitHub... (${stats.total_executions} executions)`);
            
            const response = await axios.put(this.fileUrl, payload, {
                headers: this.headers
            });

            // Update cache
            this.cache = stats;
            this.cacheTime = Date.now();
            
            console.log(`✅ Saved to GitHub! Commit: ${response.data.commit.sha.slice(0, 8)}`);
            console.log(`🔗 View at: https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${this.filePath}`);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to save to GitHub:', error.message);
            
            if (error.response?.data) {
                console.error('GitHub API Error:', error.response.data.message);
                
                if (error.response.data.message?.includes('bad credentials')) {
                    console.error('🛑 Token is invalid or expired. Regenerate your GitHub token.');
                } else if (error.response.data.message?.includes('Not Found')) {
                    console.error('🛑 Repository not found. Check GITHUB_REPO_OWNER and GITHUB_REPO_NAME.');
                }
            }
            
            // Return stats anyway (they're in cache)
            this.cache = stats;
            this.cacheTime = Date.now();
            return stats;
        }
    }

    generateCommitMessage(stats) {
        const newExecutions = stats.daily?.executions || 0;
        const totalGames = Object.keys(stats.games || {}).length;
        const totalUsers = Object.keys(stats.users || {}).length;
        
        let message = `📊 Stats Update: ${stats.total_executions} total executions`;
        
        if (newExecutions > 0) {
            message += ` (+${newExecutions} today)`;
        }
        
        message += ` | ${totalGames} games | ${totalUsers} users`;
        
        // Add emoji based on activity
        if (newExecutions > 10) message = `🚀 ${message}`;
        else if (newExecutions > 0) message = `📈 ${message}`;
        else message = `📋 ${message}`;
        
        return message;
    }

    async recordExecution(data) {
        const stats = await this.loadStats();
        const now = new Date();
        const executionId = crypto.randomBytes(8).toString('hex');
        
        const executionRecord = {
            id: executionId,
            timestamp: now.toISOString(),
            user_id: data.user_id || 'unknown',
            username: data.username || 'unknown',
            game_name: data.game_name || 'unknown',
            hwid: data.hwid || 'unknown',
            server_id: data.server_id || 'unknown'
        };
        
        // Add to executions list (limit to 10000)
        stats.executions.push(executionRecord);
        if (stats.executions.length > 10000) {
            stats.executions = stats.executions.slice(-10000);
        }
        
        // Update total
        stats.total_executions++;
        
        // Update period stats
        this.updatePeriodStats(stats, executionRecord, 'daily');
        this.updatePeriodStats(stats, executionRecord, 'weekly');
        this.updatePeriodStats(stats, executionRecord, 'monthly');
        this.updatePeriodStats(stats, executionRecord, 'yearly');
        
        // Update games stats
        const gameName = data.game_name || 'unknown';
        stats.games[gameName] = (stats.games[gameName] || 0) + 1;
        
        // Update users stats
        const userId = data.user_id || 'unknown';
        const username = data.username || 'unknown';
        if (!stats.users[userId]) {
            stats.users[userId] = { username: username, count: 0 };
        }
        stats.users[userId].count++;
        
        // Save to GitHub
        return await this.saveStats(stats);
    }

    updatePeriodStats(stats, execution, period) {
        const periodStat = stats[period];
        const now = new Date();
        const periodDate = new Date(periodStat.start_date);
        const periodMs = this.getPeriodMilliseconds(period);
        
        // Reset period if expired
        if (now - periodDate > periodMs) {
            stats[period] = this.createPeriodObject();
            return this.updatePeriodStats(stats, execution, period);
        }
        
        periodStat.executions++;
        
        // Update top games for period
        const gameName = execution.game_name || 'unknown';
        periodStat.top_games[gameName] = (periodStat.top_games[gameName] || 0) + 1;
        
        // Update top users for period
        const userId = execution.user_id || 'unknown';
        const username = execution.username || 'unknown';
        if (!periodStat.top_users[userId]) {
            periodStat.top_users[userId] = { username: username, count: 0 };
        }
        periodStat.top_users[userId].count++;
    }

    getPeriodMilliseconds(period) {
        switch(period) {
            case 'daily': return 24 * 60 * 60 * 1000;
            case 'weekly': return 7 * 24 * 60 * 60 * 1000;
            case 'monthly': return 30 * 24 * 60 * 60 * 1000;
            case 'yearly': return 365 * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }

    getTopGames(stats, period = 'total', limit = 10) {
        let gamesData = {};
        
        if (period === 'total') {
            gamesData = stats.games;
        } else if (stats[period]) {
            gamesData = stats[period].top_games;
        }
        
        return Object.entries(gamesData)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([game, count]) => ({ game, count }));
    }

    getTopUsers(stats, period = 'total', limit = 10) {
        let usersData = {};
        
        if (period === 'total') {
            usersData = stats.users;
        } else if (stats[period]) {
            usersData = stats[period].top_users;
        }
        
        return Object.entries(usersData)
            .sort(([,a], [,b]) => b.count - a.count)
            .slice(0, limit)
            .map(([userId, data]) => ({ 
                user_id: userId, 
                username: data.username, 
                count: data.count 
            }));
    }

    getPeriodCounts(stats) {
        return {
            daily: stats.daily.executions || 0,
            weekly: stats.weekly.executions || 0,
            monthly: stats.monthly.executions || 0,
            yearly: stats.yearly.executions || 0,
            total: stats.total_executions || 0
        };
    }
}

module.exports = GitHubStatsManager;
