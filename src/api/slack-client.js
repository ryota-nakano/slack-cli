/**
 * Slack API Client
 * Handles all Slack API interactions with caching
 */

const { WebClient } = require('@slack/web-api');

class SlackClient {
  constructor(token) {
    this.client = new WebClient(token);
    this.userCache = new Map();
    this.isUserToken = token.startsWith('xoxp-');
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
   * List all channels (public and private)
   */
  async listChannels() {
    const result = await this.client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200
    });
    return result.channels || [];
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
