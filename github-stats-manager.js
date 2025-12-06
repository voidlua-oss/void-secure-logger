// github-stats-manager.js
const axios = require('axios');

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
            throw new Error('GITHUB_TOKEN environment variable is required');
        }
        if (!this.owner) {
            throw new Error('GITHUB_REPO_OWNER environment variable is required');
        }
        
        console.log(`🔐 GitHub Stats Configured:`);
        console.log(`   Owner: ${this.owner}`);
        console.log(`   Repo: ${this.repo}`);
        console.log(`   File: ${this.filePath}`);
        console.log(`   Branch: ${this.branch}`);
    }

    setupGitHubAPI() {
        this.apiBase = `https://api.github.com/repos/${this.owner}/${this.repo}`;
        this.fileUrl = `${this.apiBase}/contents/${this.filePath}`;
        this.rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${this.filePath}`;
        
        this.headers = {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Void-Secure-Logger/3.2.0'
        };
    }

    async getFileSHA() {
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

    async loadStats() {
        // Check cache first
        if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
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
            
            this.cache = stats;
            this.cacheTime = Date.now();
            
            console.log(`✅ Stats loaded: ${stats.total_executions || 0} total executions`);
            return stats;
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('📝 Creating new stats file on GitHub...');
                const initialStats = this.createInitialStats();
                await this.saveStats(initialStats);
                return initialStats;
            }
            
            console.error('❌ Failed to load from GitHub:', error.message);
            console.log('🔄 Falling back to initial stats');
            return this.createInitialStats();
        }
    }

    createInitialStats() {
        return {
            total_executions: 0,
            daily: { executions: 0, top_games: {}, top_users: {}, start_date: new Date().toISOString() },
            weekly: { executions: 0, top_games: {}, top_users: {}, start_date: new Date().toISOString() },
            monthly: { executions: 0, top_games: {}, top_users: {}, start_date: new Date().toISOString() },
            yearly: { executions: 0, top_games: {}, top_users: {}, start_date: new Date().toISOString() },
            executions: [],
            games: {},
            users: {},
            start_date: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            source: 'github'
        };
    }

    async saveStats(stats) {
        stats.last_updated = new Date().toISOString();
        
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
            
            console.log(`✅ Saved! Commit: ${response.data.commit.sha.slice(0, 8)}`);
            console.log(`🔗 View at: https://github.com/${this.owner}/${this.repo}/blob/${this.branch}/${this.filePath}`);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to save to GitHub:', error.message);
            
            if (error.response?.data) {
                console.error('GitHub API Error:', JSON.stringify(error.response.data, null, 2));
                
                // Common errors and fixes:
                if (error.response.data.message?.includes('bad credentials')) {
                    console.error('🛑 Token is invalid or expired. Regenerate your GitHub token.');
                } else if (error.response.data.message?.includes('Not Found')) {
                    console.error('🛑 Repository not found. Check GITHUB_REPO_OWNER and GITHUB_REPO_NAME.');
                } else if (error.response.data.message?.includes('name already exists')) {
                    console.error('🛑 File already exists with different SHA. Try fetching latest first.');
                }
            }
            
            throw error;
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

    // Add all your existing stats methods here...
    async recordExecution(data) {
        const stats = await this.loadStats();
        // ... your existing recordExecution logic ...
        return await this.saveStats(stats);
    }
}

module.exports = GitHubStatsManager;
