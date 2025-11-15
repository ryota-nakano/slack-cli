/**
 * Slack Message API
 * Handles message-related operations
 */

const { WebClient } = require('@slack/web-api');
const UserHelper = require('../utils/user-helper');

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
    return user ? UserHelper.getDisplayName(user) : userId;
  }

  /**
   * Map raw Slack message to formatted message object
   */
  async mapMessage(msg, users, usergroups) {
    const userName = UserHelper.getMessageUserName(msg, msg.user, users);
    
    // Format mentions in text
    const formattedText = await this.formatMentionsInText(msg.text, users, usergroups);
    
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
  }

  /**
   * Format mentions in text (<@USER_ID> -> @display_name)
   */
  async formatMentionsInText(text, usersCache, usergroupsCache = null) {
    if (!text) return '';
    
    // Replace user mentions <@USER_ID> with @display_name
    let formattedText = text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
      const user = usersCache.find(u => u.id === userId);
      if (user) {
        return `@${UserHelper.getDisplayName(user)}`;
      }
      return match; // Keep original if user not found
    });
    
    // Replace group mentions <!subteam^GROUP_ID|@handle> with @group_name
    const groupMentionRegex = /<!subteam\^([A-Z0-9]+)(?:\|@[^>]+)?>/g;
    const groupMatches = [...text.matchAll(groupMentionRegex)];
    
    if (groupMatches.length > 0) {
      // Get usergroups if not provided
      const usergroups = usergroupsCache || await this.userAPI.listUsergroups();
      
      // Replace each group mention
      formattedText = formattedText.replace(groupMentionRegex, (match, groupId) => {
        const group = usergroups.find(g => g.id === groupId);
        if (group) {
          return `@${group.name}`;
        }
        return match; // Keep original if group not found
      });
    }
    
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

      // Load channel users and usergroups for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);
      const usergroups = await this.userAPI.listUsergroups();

      // Map messages and resolve user names from cache
      const messages = await Promise.all(result.messages.map(msg => 
        this.mapMessage(msg, users, usergroups)
      ));

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

      // Load channel users and usergroups for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);
      const usergroups = await this.userAPI.listUsergroups();

      // Map messages and resolve user names from cache
      const messages = await Promise.all(result.messages.map(msg => 
        this.mapMessage(msg, users, usergroups)
      ));

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

      // Load channel users and usergroups for efficient lookup
      const users = await this.userAPI.listChannelUsers(channelId);
      const usergroups = await this.userAPI.listUsergroups();

      // Map messages and resolve user names from cache
      const messages = await Promise.all(result.messages.map(msg => 
        this.mapMessage(msg, users, usergroups)
      ));

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
