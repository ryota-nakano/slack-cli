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
      rawText: msg.text || '',  // Keep original text for mention detection
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
    
    // Decode HTML entities first
    let formattedText = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Replace user mentions <@USER_ID> with @display_name (yellow)
    formattedText = formattedText.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
      const user = usersCache.find(u => u.id === userId);
      if (user) {
        return chalk.yellow(`@${UserHelper.getDisplayName(user)}`);
      }
      return match; // Keep original if user not found
    });
    
    // Replace group mentions <!subteam^GROUP_ID|@handle> with @group_name (yellow)
    const groupMentionRegex = /<!subteam\^([A-Z0-9]+)(?:\|@[^>]+)?>/g;
    const groupMatches = [...text.matchAll(groupMentionRegex)];
    
    if (groupMatches.length > 0) {
      // Get usergroups if not provided
      const usergroups = usergroupsCache || await this.userAPI.listUsergroups();
      
      // Replace each group mention
      formattedText = formattedText.replace(groupMentionRegex, (match, groupId) => {
        const group = usergroups.find(g => g.id === groupId);
        if (group) {
          return chalk.yellow(`@${group.name}`);
        }
        return match; // Keep original if group not found
      });
    }
    
    // Replace special mentions (yellow)
    formattedText = formattedText.replace(/<!channel>/g, chalk.yellow('@channel'));
    formattedText = formattedText.replace(/<!here>/g, chalk.yellow('@here'));
    formattedText = formattedText.replace(/<!everyone>/g, chalk.yellow('@everyone'));
    
    // Format URL links <https://...|display text> -> display text (URL)
    // This handles Slack's link format where URL and display text are separated by |
    formattedText = formattedText.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, (match, url, displayText) => {
      return chalk.cyan(`${displayText}`) + chalk.gray(` (${url})`);
    });
    
    // Format plain URL links <https://...> without display text
    formattedText = formattedText.replace(/<(https?:\/\/[^>]+)>/g, (match, url) => {
      return chalk.cyan(url);
    });
    
    // Replace emoji :emoji_name: with actual emoji
    formattedText = formattedText.replace(/:([a-z0-9_+-]+):/g, (match, emojiName) => {
      const emojiChar = emoji.get(emojiName);
      // If emoji found and not undefined, use it; otherwise keep original
      return emojiChar && emojiChar !== `:${emojiName}:` ? emojiChar : match;
    });
    
    // Format Slack markdown decorations
    // Bold: *text* -> bold text (but not ** or *text *text*)
    formattedText = formattedText.replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, (match, text) => {
      return chalk.bold(text);
    });
    
    // Italic: _text_ -> italic text (but not __ or _text _text_)
    formattedText = formattedText.replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, (match, text) => {
      return chalk.italic(text);
    });
    
    // Strikethrough: ~text~ -> strikethrough text
    formattedText = formattedText.replace(/(?<![~\w])~([^~\n]+)~(?![~\w])/g, (match, text) => {
      return chalk.strikethrough(text);
    });
    
    // Inline code: `code` -> code with gray background
    formattedText = formattedText.replace(/`([^`\n]+)`/g, (match, code) => {
      return chalk.bgGray.white(` ${code} `);
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
      // Handle specific error cases
      if (error.data?.error === 'missing_scope') {
        // Check if this is a DM channel
        try {
          const channelInfo = await this.client.conversations.info({ channel: channelId });
          if (channelInfo.channel?.is_im || channelInfo.channel?.is_mpim) {
            console.error(chalk.yellow('\n⚠️  im:history スコープが必要です'));
            console.error(chalk.gray('DM（ダイレクトメッセージ）を表示するには、Slack Appに im:history スコープを追加してください\n'));
          } else if (channelInfo.channel?.is_private) {
            console.error(chalk.yellow('\n⚠️  groups:history スコープが必要です'));
            console.error(chalk.gray('プライベートチャンネルを表示するには、Slack Appに groups:history スコープを追加してください\n'));
          } else {
            console.error(chalk.yellow('\n⚠️  channels:history スコープが必要です'));
            console.error(chalk.gray('チャンネルを表示するには、Slack Appに channels:history スコープを追加してください\n'));
          }
        } catch {
          console.error(chalk.yellow('\n⚠️  スコープが不足しています'));
          console.error(chalk.gray('DMの場合は im:history、プライベートチャンネルの場合は groups:history、通常のチャンネルの場合は channels:history スコープが必要です\n'));
        }
      } else if (error.data?.error === 'not_authed') {
        console.error(chalk.red('\n❌ 認証エラー: トークンが無効です\n'));
      } else {
        console.error('Failed to fetch thread replies:', error.message);
      }
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
      // Handle specific error cases
      if (error.data?.error === 'missing_scope') {
        // Check if this is a DM channel
        try {
          const channelInfo = await this.client.conversations.info({ channel: channelId });
          if (channelInfo.channel?.is_im || channelInfo.channel?.is_mpim) {
            console.error(chalk.yellow('\n⚠️  im:history スコープが必要です'));
            console.error(chalk.gray('DM（ダイレクトメッセージ）を表示するには、Slack Appに im:history スコープを追加してください\n'));
          } else if (channelInfo.channel?.is_private) {
            console.error(chalk.yellow('\n⚠️  groups:history スコープが必要です'));
            console.error(chalk.gray('プライベートチャンネルを表示するには、Slack Appに groups:history スコープを追加してください\n'));
          } else {
            console.error(chalk.yellow('\n⚠️  channels:history スコープが必要です'));
            console.error(chalk.gray('チャンネルを表示するには、Slack Appに channels:history スコープを追加してください\n'));
          }
        } catch {
          console.error(chalk.yellow('\n⚠️  スコープが不足しています'));
          console.error(chalk.gray('DMの場合は im:history、プライベートチャンネルの場合は groups:history、通常のチャンネルの場合は channels:history スコープが必要です\n'));
        }
      } else if (error.data?.error === 'not_authed') {
        console.error(chalk.red('\n❌ 認証エラー: トークンが無効です\n'));
      } else {
        console.error('Failed to fetch channel history:', error.message);
      }
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
      // Handle specific error cases
      if (error.data?.error === 'missing_scope') {
        // Check if this is a DM channel
        try {
          const channelInfo = await this.client.conversations.info({ channel: channelId });
          if (channelInfo.channel?.is_im || channelInfo.channel?.is_mpim) {
            console.error(chalk.yellow('\n⚠️  im:history スコープが必要です'));
            console.error(chalk.gray('DM（ダイレクトメッセージ）を表示するには、Slack Appに im:history スコープを追加してください\n'));
          } else if (channelInfo.channel?.is_private) {
            console.error(chalk.yellow('\n⚠️  groups:history スコープが必要です'));
            console.error(chalk.gray('プライベートチャンネルを表示するには、Slack Appに groups:history スコープを追加してください\n'));
          } else {
            console.error(chalk.yellow('\n⚠️  channels:history スコープが必要です'));
            console.error(chalk.gray('チャンネルを表示するには、Slack Appに channels:history スコープを追加してください\n'));
          }
        } catch {
          console.error(chalk.yellow('\n⚠️  スコープが不足しています'));
          console.error(chalk.gray('DMの場合は im:history、プライベートチャンネルの場合は groups:history、通常のチャンネルの場合は channels:history スコープが必要です\n'));
        }
      } else if (error.data?.error === 'not_authed') {
        console.error(chalk.red('\n❌ 認証エラー: トークンが無効です\n'));
      } else {
        console.error('Failed to fetch channel history range:', error.message);
      }
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

      const response = await this.client.chat.postMessage(options);
      
      // Return the sent message data
      return {
        ok: response.ok,
        ts: response.ts,
        message: response.message
      };
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
   * Update a message
   */
  async updateMessage(channelId, ts, text) {
    try {
      const response = await this.client.chat.update({
        channel: channelId,
        ts: ts,
        text: text
      });
      return {
        ok: response.ok,
        ts: response.ts,
        message: response.message
      };
    } catch (error) {
      if (error.data?.error === 'cant_update_message') {
        throw new Error('このメッセージは編集できません（自分のメッセージのみ編集可能）');
      } else if (error.data?.error === 'message_not_found') {
        throw new Error('メッセージが見つかりません');
      } else if (error.data?.error === 'edit_window_closed') {
        throw new Error('編集可能な時間を過ぎています');
      }
      throw new Error(`Failed to update message: ${error.message}`);
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
        let channelName = match.channel.name;
        const channelType = match.channel.is_im ? 'dm' : 
                          match.channel.is_mpim ? 'dm' : 
                          match.channel.is_group ? 'channel' : 'channel';
        
        // For DMs, get the user name instead of channel name
        if ((match.channel.is_im || match.channel.is_mpim) && !channelName) {
          // Try to get channel info to find the user
          try {
            const channelInfo = await this.client.conversations.info({ channel: channelId });
            if (channelInfo.channel) {
              if (channelInfo.channel.user) {
                // 1:1 DM - get the other user's name
                const userInfo = await this.userAPI.getUserInfo(channelInfo.channel.user);
                channelName = `DM: ${userInfo.profile?.display_name || userInfo.real_name || userInfo.name}`;
              } else if (channelInfo.channel.name) {
                // Group DM
                channelName = `DM: ${channelInfo.channel.name}`;
              } else {
                channelName = `DM: ${channelId}`;
              }
            }
          } catch (error) {
            channelName = `DM: ${channelId}`;
          }
        }
        
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
            type: channelType,
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

  /**
   * Get user's reactions
   * @param {string} userId - User ID
   * @param {number} limit - Limit number of items
   * @param {string} emojiName - Filter by emoji name (e.g., 'eyes', '+1')
   */
  async getReactions(userId, limit = 100, emojiName = null) {
    try {
      const result = await this.client.reactions.list({ 
        user: userId, 
        limit,
        full: true 
      });
      
      if (!result.items || result.items.length === 0) {
        return [];
      }

      const conversations = [];
      const seenChannels = new Set();
      const seenThreads = new Set();
      
      // Pre-fetch channel names and user names in parallel
      const channelIds = new Set();
      const userIds = new Set();
      for (const item of result.items) {
        if (item.type === 'message' && item.message) {
          channelIds.add(item.channel);
          if (item.message.user) {
            userIds.add(item.message.user);
          }
          
          // Extract user IDs from mentions in text
          if (item.message.text) {
            const mentionRegex = /<@([A-Z0-9]+)>/g;
            const mentions = [...item.message.text.matchAll(mentionRegex)];
            mentions.forEach(match => userIds.add(match[1]));
          }
        }
      }
      
      // Fetch all channel names and user names at once
      const channelNameCache = {};
      const userNameCache = {};
      const userObjectCache = {}; // Full user objects for mention formatting
      
      await Promise.all([
        // Fetch channel names (and handle DMs)
        ...Array.from(channelIds).map(async (channelId) => {
          try {
            const channelInfo = await this.client.conversations.info({ channel: channelId });
            const channel = channelInfo.channel;
            
            // Check if this is a DM
            if (channel.is_im || channel.is_mpim) {
              if (channel.user) {
                // 1:1 DM - get the other user's name
                const dmUserInfo = await this.userAPI.getUserInfo(channel.user);
                channelNameCache[channelId] = `DM: ${dmUserInfo.profile?.display_name || dmUserInfo.real_name || dmUserInfo.name}`;
              } else if (channel.name) {
                // Group DM
                channelNameCache[channelId] = `DM: ${channel.name}`;
              } else {
                channelNameCache[channelId] = `DM: ${channelId}`;
              }
            } else {
              // Regular channel
              channelNameCache[channelId] = channel.name || channelId;
            }
          } catch (error) {
            channelNameCache[channelId] = channelId;
          }
        }),
        // Fetch user names
        ...Array.from(userIds).map(async (userId) => {
          try {
            const userInfo = await this.client.users.info({ user: userId });
            const user = userInfo.user;
            userNameCache[userId] = user.profile?.display_name || user.real_name || user.name;
            userObjectCache[userId] = {
              id: user.id,
              name: user.name,
              real_name: user.real_name,
              profile: user.profile
            };
          } catch (error) {
            userNameCache[userId] = userId;
          }
        })
      ]);
      
      // Convert user object cache to array for formatMentionsInText
      const usersArray = Object.values(userObjectCache);

      for (const item of result.items) {
        // Only process message type items
        if (item.type !== 'message' || !item.message) {
          continue;
        }

        const channelId = item.channel;
        const message = item.message;
        const threadTs = message.thread_ts || null;
        
        // Get channel name from cache
        const channelName = channelNameCache[channelId] || channelId;

        // Check if this message is part of a thread or is a thread parent
        const isThreadReply = threadTs && message.ts !== threadTs;
        const isThreadParent = (threadTs && message.ts === threadTs) || 
                               (message.reply_count && message.reply_count > 0);
        
        // Use thread_ts if it's a reply, or message.ts if it's a thread parent
        const actualThreadTs = isThreadReply ? threadTs : 
                               (isThreadParent ? message.ts : null);
        
        const key = actualThreadTs ? `${channelId}:${actualThreadTs}` : channelId;

        if (actualThreadTs && !seenThreads.has(key)) {
          seenThreads.add(key);
          
          // Format mentions in text
          const formattedText = await this.formatMentionsInText(message.text || '', usersArray);
          
          // Use message text as preview (no API call)
          const threadPreview = {
            text: formattedText,
            user: message.user,
            userName: userNameCache[message.user] || '',
            ts: message.ts
          };

          // Get user's reactions on this message
          const yourReactions = message.reactions?.filter(r => 
            r.users?.includes(userId)
          ) || [];
          const reactionNames = yourReactions.map(r => 
            r.name.replace(/::skin-tone-\d+$/, '')
          );
          
          // Filter by emoji name if specified
          if (emojiName && !reactionNames.includes(emojiName)) {
            continue;
          }

          conversations.push({
            channelId,
            channelName,
            threadTs: actualThreadTs,
            type: 'thread',
            threadPreview,
            reactions: reactionNames,
            messageTs: message.ts  // ✅ リアクション削除に必要
          });
        } else if (!actualThreadTs && !seenChannels.has(channelId)) {
          seenChannels.add(channelId);
          
          // Get user's reactions on this message
          const yourReactions = message.reactions?.filter(r => 
            r.users?.includes(userId)
          ) || [];
          const reactionNames = yourReactions.map(r => 
            r.name.replace(/::skin-tone-\d+$/, '')
          );
          
          // Filter by emoji name if specified
          if (emojiName && !reactionNames.includes(emojiName)) {
            continue;
          }

          conversations.push({
            channelId,
            channelName,
            threadTs: null,
            type: 'channel',
            reactions: reactionNames,
            messageTs: message.ts  // ✅ リアクション削除に必要
          });
        }
      }

      return conversations;
    } catch (error) {
      if (error.data?.error === 'missing_scope') {
        console.error(chalk.yellow('\n⚠️  reactions:read スコープが必要です'));
        console.error(chalk.gray('リアクションを表示するには、Slack Appに reactions:read スコープを追加してください\n'));
      } else if (error.data?.error === 'not_authed') {
        console.error(chalk.red('\n❌ 認証エラー: トークンが無効です\n'));
      } else {
        console.error('Failed to get reactions:', error.message);
      }
      return [];
    }
  }

  /**
   * Remove reaction from a message
   */
  async removeReaction(channelId, timestamp, emojiName) {
    try {
      await this.client.reactions.remove({
        channel: channelId,
        timestamp: timestamp,
        name: emojiName
      });
      return true;
    } catch (error) {
      if (error.data?.error === 'missing_scope') {
        throw new Error('reactions:write スコープが必要です');
      } else if (error.data?.error === 'not_authed') {
        throw new Error('認証エラー: トークンが無効です');
      } else if (error.data?.error === 'no_reaction') {
        throw new Error('リアクションが見つかりません');
      } else {
        throw error;
      }
    }
  }
}

module.exports = SlackMessageAPI;
