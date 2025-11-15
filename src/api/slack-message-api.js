/**
 * Slack Message API
 * Handles message-related operations
 */

const { WebClient } = require('@slack/web-api');

class SlackMessageAPI {
  constructor(token, userAPI) {
    this.client = new WebClient(token);
    this.userAPI = userAPI;
  }

  /**
   * Resolve user name from user ID (uses cache)
   */
  resolveUserName(userId, usersCache) {
    if (!userId) return '';
    
    const user = usersCache.find(u => u.id === userId);
    return user?.display_name || user?.real_name || userId;
  }

  /**
   * Format mentions in text (<@USER_ID> -> @display_name)
   */
  formatMentionsInText(text, usersCache) {
    if (!text) return '';
    
    // Replace user mentions <@USER_ID> with @display_name
    let formattedText = text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
      const user = usersCache.find(u => u.id === userId);
      if (user) {
        return `@${user.display_name || user.real_name || userId}`;
      }
      return match; // Keep original if user not found
    });
    
    // Replace special mentions
    formattedText = formattedText.replace(/<!channel>/g, '@channel');
    formattedText = formattedText.replace(/<!here>/g, '@here');
    formattedText = formattedText.replace(/<!everyone>/g, '@everyone');
    
    return formattedText;
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(channelId, threadTs) {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 1000
      });

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      // Load channel users for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);

      // Map messages and resolve user names from cache
      const messages = result.messages.map(msg => {
        // Try user_profile first, but only if not empty
        const profileDisplayName = msg.user_profile?.display_name?.trim();
        const profileRealName = msg.user_profile?.real_name?.trim();
        const userName = profileDisplayName 
          || profileRealName 
          || this.resolveUserName(msg.user, users);
        
        // Format mentions in text
        const formattedText = this.formatMentionsInText(msg.text, users);
        
        return {
          ts: msg.ts,
          user: msg.user,
          userName,
          text: formattedText || '',
          thread_ts: msg.thread_ts,
          reply_count: msg.reply_count || 0,
          reactions: msg.reactions || [],
          files: msg.files || [],
          edited: msg.edited ? true : false
        };
      });

      return messages;
    } catch (error) {
      console.error('Failed to fetch thread replies:', error.message);
      return [];
    }
  }

  /**
   * Get channel history
   */
  async getChannelHistory(channelId, limit = null, oldest = null) {
    try {
      const options = {
        channel: channelId,
        limit: limit || 1000
      };

      if (oldest !== null) {
        options.oldest = oldest;
      }

      const result = await this.client.conversations.history(options);

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      // Load channel users for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);

      // Map messages and resolve user names from cache
      const messages = result.messages.map(msg => {
        // Try user_profile first, but only if not empty
        const profileDisplayName = msg.user_profile?.display_name?.trim();
        const profileRealName = msg.user_profile?.real_name?.trim();
        const userName = profileDisplayName 
          || profileRealName 
          || this.resolveUserName(msg.user, users);
        
        // Format mentions in text
        const formattedText = this.formatMentionsInText(msg.text, users);
        
        return {
          ts: msg.ts,
          user: msg.user,
          userName,
          text: formattedText || '',
          thread_ts: msg.thread_ts,
          reply_count: msg.reply_count || 0,
          reactions: msg.reactions || [],
          files: msg.files || [],
          edited: msg.edited ? true : false
        };
      });

      return messages.reverse();
    } catch (error) {
      console.error('Failed to fetch channel history:', error.message);
      return [];
    }
  }

  /**
   * Get channel history within a date range
   */
  async getChannelHistoryRange(channelId, oldest, latest, limit = null) {
    try {
      const options = {
        channel: channelId,
        oldest: oldest.toString(),
        latest: latest.toString(),
        limit: limit || 1000
      };

      const result = await this.client.conversations.history(options);

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      // Load channel users for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);

      // Map messages and resolve user names from cache
      const messages = result.messages.map(msg => {
        // Try user_profile first, but only if not empty
        const profileDisplayName = msg.user_profile?.display_name?.trim();
        const profileRealName = msg.user_profile?.real_name?.trim();
        const userName = profileDisplayName 
          || profileRealName 
          || this.resolveUserName(msg.user, users);
        
        // Format mentions in text
        const formattedText = this.formatMentionsInText(msg.text, users);
        
        return {
          ts: msg.ts,
          user: msg.user,
          userName,
          text: formattedText || '',
          thread_ts: msg.thread_ts,
          reply_count: msg.reply_count || 0,
          reactions: msg.reactions || [],
          files: msg.files || [],
          edited: msg.edited ? true : false
        };
      });

      return messages.reverse();
    } catch (error) {
      console.error('Failed to fetch channel history range:', error.message);
      return [];
    }
  }

  /**
   * Send a message to channel or thread
   */
  async sendMessage(channelId, text, threadTs = null) {
    try {
      const options = {
        channel: channelId,
        text: text
      };

      if (threadTs) {
        options.thread_ts = threadTs;
      }

      await this.client.chat.postMessage(options);
      return true;
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channelId, ts) {
    try {
      await this.client.chat.delete({
        channel: channelId,
        ts: ts
      });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }

  /**
   * Mark channel as read
   */
  async markAsRead(channelId, ts) {
    try {
      await this.client.conversations.mark({
        channel: channelId,
        ts: ts
      });
      return true;
    } catch (error) {
      // Show the error but don't crash the app
      console.error('Failed to mark as read:', error.message);
      return false;
    }
  }

  /**
   * Search for user's messages today
   */
  async searchUserMessagesToday(currentUserId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Math.floor(today.getTime() / 1000);

      const result = await this.client.search.messages({
        query: `from:<@${currentUserId}> after:${todayTimestamp}`,
        sort: 'timestamp',
        sort_dir: 'desc',
        count: 100
      });

      if (!result.messages || !result.messages.matches) {
        return [];
      }

      const conversations = [];
      const seenChannels = new Set();
      const seenThreads = new Set();

      for (const match of result.messages.matches) {
        const channelId = match.channel.id;
        const channelName = match.channel.name;
        const threadTs = match.ts === match.thread_ts ? null : match.thread_ts;
        const key = threadTs ? `${channelId}:${threadTs}` : channelId;

        if (threadTs && !seenThreads.has(key)) {
          seenThreads.add(key);
          conversations.push({
            channelId,
            channelName,
            threadTs,
            type: 'thread',
            text: match.text
          });
        } else if (!threadTs && !seenChannels.has(channelId)) {
          seenChannels.add(channelId);
          conversations.push({
            channelId,
            channelName,
            threadTs: null,
            type: 'channel',
            text: match.text
          });
        }
      }

      return conversations;
    } catch (error) {
      console.error('Failed to search user messages:', error.message);
      return [];
    }
  }
}

module.exports = SlackMessageAPI;
