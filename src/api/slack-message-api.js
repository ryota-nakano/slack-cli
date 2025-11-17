/**
 * Slack Message API
 * Handles message-related operations
 */

const { WebClient } = require('@slack/web-api');
const UserHelper = require('../utils/user-helper');
const emoji = require('node-emoji');
const chalk = require('chalk');

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
    
    // Map files to include necessary information
    const files = (msg.files || []).map(file => ({
      id: file.id,
      name: file.name,
      title: file.title,
      url: file.url_private || file.url_private_download || file.permalink,
      mimetype: file.mimetype,
      size: file.size
    }));
    
    return {
      ts: msg.ts,
      user: msg.user,
      userName,
      text: formattedText || '',
      thread_ts: msg.thread_ts,
      reply_count: msg.reply_count || 0,
      reactions: msg.reactions || [],
      files: files,
      edited: msg.edited ? true : false
    };
  }

  /**
   * Format mentions in text (<@USER_ID> -> @display_name)
   */
  async formatMentionsInText(text, usersCache, usergroupsCache = null) {
    if (!text) return '';
    
    // Replace user mentions <@USER_ID> with @display_name with background
    let formattedText = text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
      const user = usersCache.find(u => u.id === userId);
      if (user) {
        return chalk.bgBlue.white(`@${UserHelper.getDisplayName(user)}`);
      }
      return match; // Keep original if user not found
    });
    
    // Replace group mentions <!subteam^GROUP_ID|@handle> with @group_name with background
    const groupMentionRegex = /<!subteam\^([A-Z0-9]+)(?:\|@[^>]+)?>/g;
    const groupMatches = [...text.matchAll(groupMentionRegex)];
    
    if (groupMatches.length > 0) {
      // Get usergroups if not provided
      const usergroups = usergroupsCache || await this.userAPI.listUsergroups();
      
      // Replace each group mention
      formattedText = formattedText.replace(groupMentionRegex, (match, groupId) => {
        const group = usergroups.find(g => g.id === groupId);
        if (group) {
          return chalk.bgBlue.white(`@${group.name}`);
        }
        return match; // Keep original if group not found
      });
    }
    
    // Replace special mentions with background
    formattedText = formattedText.replace(/<!channel>/g, chalk.bgBlue.white('@channel'));
    formattedText = formattedText.replace(/<!here>/g, chalk.bgBlue.white('@here'));
    formattedText = formattedText.replace(/<!everyone>/g, chalk.bgBlue.white('@everyone'));
    
    // Replace emoji :emoji_name: with actual emoji
    formattedText = formattedText.replace(/:([a-z0-9_+-]+):/g, (match, emojiName) => {
      const emojiChar = emoji.get(emojiName);
      // If emoji found and not undefined, use it; otherwise keep original
      return emojiChar && emojiChar !== `:${emojiName}:` ? emojiChar : match;
    });
    
    return formattedText;
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(channelId, threadTs) {
    try {
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] スレッド取得開始: ${channelId}`);
      }
      
      const startTime = Date.now();
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 1000
      });
      const apiTime = Date.now() - startTime;

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] API呼び出し完了: ${apiTime}ms (${result.messages.length}件)`);
      }

      // Load channel users and usergroups for efficient lookup
      const usersStartTime = Date.now();
      const users = await this.userAPI.listChannelUsers(channelId);
      const usersTime = Date.now() - usersStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] ユーザー取得完了: ${usersTime}ms (${users.length}件)`);
      }
      
      const groupsStartTime = Date.now();
      const usergroups = await this.userAPI.listUsergroups();
      const groupsTime = Date.now() - groupsStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] グループ取得完了: ${groupsTime}ms (${usergroups.length}件)`);
      }

      // Map messages and resolve user names from cache
      const mapStartTime = Date.now();
      const messages = await Promise.all(result.messages.map(msg => 
        this.mapMessage(msg, users, usergroups)
      ));
      const mapTime = Date.now() - mapStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] メッセージマッピング完了: ${mapTime}ms`);
        console.error(`[DEBUG] 合計時間: ${Date.now() - startTime}ms`);
      }

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
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] チャンネル履歴取得開始: ${channelId}`);
      }
      
      const startTime = Date.now();
      const options = {
        channel: channelId,
        oldest: oldest.toString(),
        latest: latest.toString(),
        limit: limit || 1000
      };

      const result = await this.client.conversations.history(options);
      const apiTime = Date.now() - startTime;

      if (!result.messages || result.messages.length === 0) {
        return [];
      }

      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] API呼び出し完了: ${apiTime}ms (${result.messages.length}件)`);
      }

      // Load channel users and usergroups for efficient lookup
      const usersStartTime = Date.now();
      const users = await this.userAPI.listChannelUsers(channelId);
      const usersTime = Date.now() - usersStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] ユーザー取得完了: ${usersTime}ms (${users.length}件)`);
      }
      
      const groupsStartTime = Date.now();
      const usergroups = await this.userAPI.listUsergroups();
      const groupsTime = Date.now() - groupsStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] グループ取得完了: ${groupsTime}ms (${usergroups.length}件)`);
      }

      // Map messages and resolve user names from cache
      const mapStartTime = Date.now();
      const messages = await Promise.all(result.messages.map(msg => 
        this.mapMessage(msg, users, usergroups)
      ));
      const mapTime = Date.now() - mapStartTime;
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] メッセージマッピング完了: ${mapTime}ms`);
        console.error(`[DEBUG] 合計時間: ${Date.now() - startTime}ms`);
      }

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
    // Validate parameters
    if (!channelId || !ts) {
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] markAsRead: 無効なパラメータ channelId=${channelId}, ts=${ts}`);
      }
      return false;
    }

    try {
      await this.client.conversations.mark({
        channel: channelId,
        ts: ts
      });
      return true;
    } catch (error) {
      // Show the error but don't crash the app
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] Failed to mark as read: ${error.message}`);
      }
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
