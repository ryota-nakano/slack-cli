/**
 * History Manager
 * Track and manage conversation history for quick access
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class HistoryManager {
  constructor() {
    this.historyFile = path.join(os.tmpdir(), 'slack-cli-history.json');
    this.history = this.loadHistory();
  }

  /**
   * Load history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[WARN] 履歴ファイルの読み込みエラー:', error.message);
    }
    return [];
  }

  /**
   * Save history to file
   */
  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (error) {
      console.error('[WARN] 履歴ファイルの保存エラー:', error.message);
    }
  }

  /**
   * Add or update conversation in history
   * @param {Object} conversation - { channelId, channelName, threadTs?, type: 'channel'|'thread' }
   */
  addConversation(conversation) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Remove old entries (keep only today's)
    this.history = this.history.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= today;
    });

    // Find existing entry
    const existingIndex = this.history.findIndex(item => {
      if (conversation.type === 'thread') {
        return item.channelId === conversation.channelId && 
               item.threadTs === conversation.threadTs;
      } else {
        return item.channelId === conversation.channelId && 
               !item.threadTs;
      }
    });

    const entry = {
      channelId: conversation.channelId,
      channelName: conversation.channelName,
      threadTs: conversation.threadTs || null,
      type: conversation.type,
      timestamp: now.toISOString()
    };

    if (existingIndex >= 0) {
      // Update timestamp
      this.history[existingIndex] = entry;
    } else {
      // Add new entry at the beginning
      this.history.unshift(entry);
    }

    // Keep only last 20 entries
    this.history = this.history.slice(0, 20);

    this.saveHistory();
  }

  /**
   * Get today's conversation history (sorted by most recent)
   */
  getTodayHistory() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.history.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= today;
    });
  }

  /**
   * Clear all history
   */
  clearHistory() {
    this.history = [];
    this.saveHistory();
  }
}

module.exports = HistoryManager;
