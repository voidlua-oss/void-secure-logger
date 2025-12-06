// stats.js - Statistics module
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class StatsManager {
    constructor() {
        this.statsFile = path.join(__dirname, 'execution-stats.json');
        this.initStats();
    }

    async initStats() {
        try {
            await fs.access(this.statsFile);
            console.log('📊 Stats file exists');
        } catch {
            const initialStats = {
                total_executions: 0,
                daily: this.createPeriodObject(),
                weekly: this.createPeriodObject(),
                monthly: this.createPeriodObject(),
                yearly: this.createPeriodObject(),
                executions: [],
                games: {},
                users: {},
                start_date: new Date().toISOString()
            };
            await this.saveStats(initialStats);
            console.log('📊 Created new stats file');
        }
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
        try {
            const data = await fs.readFile(this.statsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ Error loading stats:', error);
            return this.createInitialStats();
        }
    }

    async saveStats(stats) {
        try {
            await fs.writeFile(this.statsFile, JSON.stringify(stats, null, 2));
        } catch (error) {
            console.error('❌ Error saving stats:', error);
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
            start_date: new Date().toISOString()
        };
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
        
        stats.executions.push(executionRecord);
        if (stats.executions.length > 50000) {
            stats.executions = stats.executions.slice(-50000);
        }
        
        stats.total_executions++;
        this.updatePeriodStats(stats, executionRecord, 'daily');
        this.updatePeriodStats(stats, executionRecord, 'weekly');
        this.updatePeriodStats(stats, executionRecord, 'monthly');
        this.updatePeriodStats(stats, executionRecord, 'yearly');
        
        const gameName = data.game_name || 'unknown';
        stats.games[gameName] = (stats.games[gameName] || 0) + 1;
        
        const userId = data.user_id || 'unknown';
        const username = data.username || 'unknown';
        if (!stats.users[userId]) {
            stats.users[userId] = { username: username, count: 0 };
        }
        stats.users[userId].count++;
        
        await this.saveStats(stats);
        return executionRecord;
    }

    updatePeriodStats(stats, execution, period) {
        const periodStat = stats[period];
        const now = new Date();
        const periodDate = new Date(periodStat.start_date);
        const periodMs = this.getPeriodMilliseconds(period);
        
        if (now - periodDate > periodMs) {
            stats[period] = this.createPeriodObject();
            return this.updatePeriodStats(stats, execution, period);
        }
        
        periodStat.executions++;
        const gameName = execution.game_name || 'unknown';
        periodStat.top_games[gameName] = (periodStat.top_games[gameName] || 0) + 1;
        
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

    getTopGames(stats, period = 'total', limit = 5) {
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

    getTopUsers(stats, period = 'total', limit = 5) {
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

module.exports = new StatsManager();
