/**
 * Slack API Client
 * Handles all Slack API interactions with caching
 */

const { WebClient } = require('@slack/web-api');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Cache directory in user's home
const CACHE_DIR = path.join(os.homedir(), '.slack-cli');
const CHANNEL_CACHE_FILE = path.join(CACHE_DIR, 'channels-cache.json');

class SlackClient {
  constructor(token) {
    this.client = new WebClient(token);
    this.userCache = new Map();
    this.channelCache = null; // Cache all channels
    this.channelCacheTime = null;
    this.isUserToken = token.startsWith('xoxp-');
    
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // Load channel cache from file
    this.loadChannelCacheFromFile();
  }

  /**
   * Load channel cache from file
   */
  loadChannelCacheFromFile() {
    try {
      if (fs.existsSync(CHANNEL_CACHE_FILE)) {
        const data = fs.readFileSync(CHANNEL_CACHE_FILE, 'utf8');
        const cached = JSON.parse(data);
        
        // Check if cache is still valid (24 hours)
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for file cache
        if (cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
          this.channelCache = cached.channels;
          this.channelCacheTime = cached.timestamp;
          
          if (process.env.DEBUG_CHANNELS) {
            console.error(`[DEBUG] ファイルからキャッシュ読み込み: ${this.channelCache.length}件 (${new Date(cached.timestamp).toLocaleString()})`);
          }
        } else {
          if (process.env.DEBUG_CHANNELS) {
            console.error('[DEBUG] キャッシュファイルが古いため無効');
          }
        }
      }
    } catch (error) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] キャッシュ読み込みエラー: ${error.message}`);
      }
    }
  }

  /**
   * Save channel cache to file
   */
  saveChannelCacheToFile() {
    try {
      const data = {
        timestamp: this.channelCacheTime,
        channels: this.channelCache
      };
      
      fs.writeFileSync(CHANNEL_CACHE_FILE, JSON.stringify(data), 'utf8');
      
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] キャッシュをファイルに保存: ${this.channelCache.length}件`);
      }
    } catch (error) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] キャッシュ保存エラー: ${error.message}`);
      }
    }
  }

  /**
   * Get user information with caching
   */
  async getUserInfo(userId) {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }

    try {
      const result = await this.client.users.info({ user: userId });
      const user = result.user;
      const info = {
        id: user.id,
        name: user.name,
        realName: user.real_name || user.name,
        displayName: user.profile.display_name || user.real_name || user.name,
        isBot: user.is_bot || false,
        deleted: user.deleted || false
      };
      
      this.userCache.set(userId, info);
      return info;
    } catch (error) {
      // Return fallback on error
      return {
        id: userId,
        name: userId,
        realName: userId,
        displayName: userId,
        isBot: false,
        deleted: false
      };
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const authTest = await this.client.auth.test();
      return await this.getUserInfo(authTest.user_id);
    } catch (error) {
      return { id: 'unknown', displayName: 'あなた' };
    }
  }

  /**
   * List all channels (public and private) with caching
   * @param {boolean} forceRefresh - Force refresh cache
   */
  async listChannels(forceRefresh = false) {
    // Return cached channels if available (cache for 5 minutes in memory)
    const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    if (!forceRefresh && this.channelCache && this.channelCacheTime && 
        (Date.now() - this.channelCacheTime < MEMORY_CACHE_TTL)) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] メモリキャッシュから取得: ${this.channelCache.length}件`);
      }
      return this.channelCache;
    }

    if (process.env.DEBUG_CHANNELS) {
      console.error('[DEBUG] 参加チャンネル取得開始...');
    }

    const allChannels = [];
    let cursor = undefined;
    let pageCount = 0;

    try {
      do {
        // Use users.conversations to get only user's channels
        const result = await this.client.users.conversations({
          types: 'public_channel,private_channel',
          limit: 200,
          cursor: cursor,
          exclude_archived: true
        });

        const channels = result.channels || [];
        allChannels.push(...channels);
        pageCount++;

        if (process.env.DEBUG_CHANNELS) {
          console.error(`[DEBUG] ページ${pageCount}: ${channels.length}件取得, 累計: ${allChannels.length}件`);
          console.error(`[DEBUG] next_cursor: ${result.response_metadata?.next_cursor ? '有り' : '無し'}`);
        }

        cursor = result.response_metadata?.next_cursor;
        
        // Rate limit protection: wait between pages
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } while (cursor);

      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] 取得完了: 合計 ${allChannels.length}件の参加チャンネル (${pageCount}ページ)\n`);
      }

      // Cache the results
      this.channelCache = allChannels;
      this.channelCacheTime = Date.now();
      
      // Save to file for next time
      this.saveChannelCacheToFile();

      return allChannels;
    } catch (error) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] チャンネル取得エラー: ${error.message}`);
      }
      
      // If we got some channels before error, return them
      if (allChannels.length > 0) {
        this.channelCache = allChannels;
        this.channelCacheTime = Date.now();
        this.saveChannelCacheToFile();
        return allChannels;
      }
      
      // Otherwise return empty or cached data
      return this.channelCache || [];
    }
  }

  /**
   * Search channels by name (only channels the user is a member of)
   * Uses cached channel list for fast search
   * @param {string} query - Search query
   * @param {number} limit - Max results to return
   */
  async searchChannels(query = '', limit = 20) {
    if (process.env.DEBUG_CHANNELS) {
      console.error(`[DEBUG] チャンネル検索: "${query}"`);
    }

    // Get all channels from cache (or fetch if needed)
    const allChannels = await this.listChannels();
    
    if (process.env.DEBUG_CHANNELS) {
      console.error(`[DEBUG] ${allChannels.length}件のチャンネルから検索`);
    }

    // Filter by search term
    const searchTerm = query.toLowerCase();
    const filtered = allChannels.filter(channel => 
      channel.name.toLowerCase().includes(searchTerm)
    );

    if (process.env.DEBUG_CHANNELS) {
      console.error(`[DEBUG] 検索結果: ${filtered.length}件`);
      if (filtered.length > 0 && filtered.length <= 5) {
        filtered.forEach(ch => {
          console.error(`[DEBUG]   → ${ch.name} (${ch.id})`);
        });
      }
    }

    return filtered.slice(0, limit);
  }

  /**
   * Get channel information
   */
  async getChannelInfo(channelId) {
    try {
      const result = await this.client.conversations.info({ channel: channelId });
      return result.channel;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get channel members (non-bot, non-deleted users only)
   */
  async getChannelMembers(channelId) {
    try {
      const result = await this.client.conversations.members({
        channel: channelId,
        limit: 100
      });

      const memberIds = result.members || [];
      const members = [];

      for (let i = 0; i < memberIds.length; i++) {
        const user = await this.getUserInfo(memberIds[i]);
        if (!user.isBot && !user.deleted) {
          members.push(user);
        }
        
        // Rate limit protection
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return members;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(channelId, threadTs) {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 100
      });

      const messages = result.messages || [];
      const replies = [];

      for (const msg of messages) {
        let userName = 'Unknown';
        if (msg.user) {
          const user = await this.getUserInfo(msg.user);
          userName = user.displayName;
        } else if (msg.bot_id) {
          userName = msg.username || 'Bot';
        }

        replies.push({
          ts: msg.ts,
          user: userName,
          text: msg.text || '',
          timestamp: new Date(parseFloat(msg.ts) * 1000)
        });
      }

      return replies;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get channel message history
   */
  async getChannelHistory(channelId, limit = 20) {
    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit: limit
      });

      const messages = result.messages || [];
      const history = [];

      for (const msg of messages) {
        let userName = 'Unknown';
        if (msg.user) {
          const user = await this.getUserInfo(msg.user);
          userName = user.displayName;
        } else if (msg.bot_id) {
          userName = msg.username || 'Bot';
        }

        history.push({
          ts: msg.ts,
          user: userName,
          text: msg.text || '',
          timestamp: new Date(parseFloat(msg.ts) * 1000)
        });
      }

      // Reverse to show oldest first
      return history.reverse();
    } catch (error) {
      return [];
    }
  }

  /**
   * Send a message to a channel or thread
   */
  async sendMessage(channelId, text, threadTs = null) {
    const params = {
      channel: channelId,
      text: text
    };

    if (threadTs) {
      params.thread_ts = threadTs;
    }

    return await this.client.chat.postMessage(params);
  }

  /**
   * Delete a message
   */
  async deleteMessage(channelId, ts) {
    try {
      return await this.client.chat.delete({
        channel: channelId,
        ts: ts
      });
    } catch (error) {
      throw new Error(`メッセージの削除に失敗しました: ${error.message}`);
    }
  }
}

module.exports = SlackClient;
