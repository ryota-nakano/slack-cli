/**
 * Slack User API
 * Handles user-related operations
 */

const { WebClient } = require('@slack/web-api');

class SlackUserAPI {
  constructor(token, cache) {
    this.client = new WebClient(token);
    this.cache = cache;
  }

  /**
   * Get user information by user ID
   */
  async getUserInfo(userId) {
    // Check cache first
    const cachedUser = this.cache.findUserById(userId);
    if (cachedUser) {
      return cachedUser;
    }

    try {
      const result = await this.client.users.info({
        user: userId
      });

      if (result.user) {
        return {
          id: result.user.id,
          name: result.user.name,
          real_name: result.user.real_name,
          display_name: result.user.profile?.display_name || result.user.real_name,
          is_bot: result.user.is_bot || false
        };
      }
    } catch (error) {
      console.error(`Failed to fetch user info for ${userId}:`, error.message);
    }

    return null;
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const result = await this.client.auth.test();
      return {
        userId: result.user_id,
        teamId: result.team_id
      };
    } catch (error) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }
  }

  /**
   * Get all usergroups (with caching)
   */
  async listUsergroups() {
    // Check cache first
    if (this.cache.isUsergroupsCacheValid()) {
      if (process.env.DEBUG_PERF) {
        const groups = this.cache.getUsergroups();
        console.error(`[DEBUG] ユーザーグループキャッシュヒット (${groups.length}件)`);
      }
      return this.cache.getUsergroups();
    }

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] ユーザーグループをAPI取得`);
    }

    try {
      const result = await this.client.usergroups.list({
        include_users: false,
        include_count: false,
        include_disabled: false
      });

      if (result.usergroups) {
        const usergroups = result.usergroups.map(ug => ({
          id: ug.id,
          handle: ug.handle,
          name: ug.name
        }));
        
        // Update cache
        this.cache.updateUsergroups(usergroups);
        
        return usergroups;
      }
    } catch (error) {
      console.error('Failed to fetch usergroups:', error.message);
      // Return cached data if available, even if expired
      return this.cache.getUsergroups();
    }

    return [];
  }

  /**
   * Get usergroup information by usergroup ID
   */
  async getUsergroupInfo(usergroupId) {
    try {
      const result = await this.client.usergroups.list({
        include_users: false,
        include_count: false,
        include_disabled: false
      });

      if (result.usergroups) {
        const usergroup = result.usergroups.find(ug => ug.id === usergroupId);
        if (usergroup) {
          return {
            id: usergroup.id,
            handle: usergroup.handle,
            name: usergroup.name
          };
        }
      }
    } catch (error) {
      console.error(`Failed to fetch usergroup info for ${usergroupId}:`, error.message);
    }

    return null;
  }

  /**
   * Get users by IDs (with caching and batching)
   */
  async getUsersByIds(userIds) {
    const users = [];
    const uncachedIds = [];

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] getUsersByIds開始: ${userIds.length}件`);
    }

    // Check cache first
    for (const userId of userIds) {
      const cachedUser = this.cache.findUserById(userId);
      if (cachedUser) {
        users.push(cachedUser);
      } else {
        uncachedIds.push(userId);
      }
    }

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] キャッシュミス: ${uncachedIds.length}件`);
    }

    // If we have many uncached users, fetch all users instead of one by one
    if (uncachedIds.length > 50) {
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] 大量のユーザーが未キャッシュ→全ユーザーを一括取得`);
      }
      
      const allUsersStartTime = Date.now();
      await this.listAllUsers(true); // Force refresh to get all users
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] 全ユーザー取得完了: ${Date.now() - allUsersStartTime}ms`);
      }
      
      // Now get from cache
      for (const userId of uncachedIds) {
        const cachedUser = this.cache.findUserById(userId);
        if (cachedUser) {
          users.push(cachedUser);
        }
      }
    } else {
      // Fetch uncached users one by one (only if small number)
      if (process.env.DEBUG_PERF && uncachedIds.length > 0) {
        console.error(`[DEBUG] 個別ユーザー取得: ${uncachedIds.length}件`);
      }
      
      for (const userId of uncachedIds) {
        try {
          const result = await this.client.users.info({ user: userId });
          if (result.user && !result.user.deleted) {
            const user = {
              id: result.user.id,
              name: result.user.name,
              real_name: result.user.real_name,
              display_name: result.user.profile?.display_name || result.user.real_name,
              is_bot: result.user.is_bot || false
            };
            users.push(user);
            this.cache.addUser(user);
          }
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error.message);
        }
      }
    }

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] getUsersByIds完了: ${users.length}件返却`);
    }

    return users;
  }

  /**
   * List all users (kept for compatibility, but prefer listChannelUsers for better performance)
   */
  async listAllUsers(forceRefresh = false) {
    if (!forceRefresh && this.cache.isUsersCacheValid()) {
      if (process.env.DEBUG_PERF) {
        const cached = this.cache.getUsers();
        console.error(`[DEBUG] 全ユーザーキャッシュヒット (${cached.length}件)`);
      }
      return this.cache.getUsers();
    }

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] 全ユーザーをAPI取得開始`);
    }

    try {
      let users = [];
      let cursor = undefined;
      let apiCalls = 0;

      do {
        const result = await this.client.users.list({
          limit: 1000,
          cursor: cursor
        });
        apiCalls++;

        if (result.members) {
          // Include bots as well (they might post messages)
          const allUsers = result.members
            .filter(member => !member.deleted)
            .map(member => ({
              id: member.id,
              name: member.name,
              real_name: member.real_name,
              display_name: member.profile?.display_name || member.real_name,
              is_bot: member.is_bot || false
            }));

          users = users.concat(allUsers);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] 全ユーザー取得完了: ${apiCalls}回のAPI呼び出し, ${users.length}人`);
      }

      this.cache.updateUsers(users);
      return users;
    } catch (error) {
      console.error('Failed to fetch users:', error.message);
      return this.cache.getUsers();
    }
  }

  /**
   * List users in a specific channel (with caching)
   */
  async listChannelUsers(channelId, forceRefresh = false) {
    // Check if we have cached members for this channel
    if (!forceRefresh && this.cache.isChannelMembersCacheValid(channelId)) {
      if (process.env.DEBUG_PERF) {
        const users = this.cache.getChannelMembers(channelId);
        console.error(`[DEBUG] チャンネルユーザーキャッシュヒット: ${channelId} (${users.length}件)`);
      }
      return this.cache.getChannelMembers(channelId);
    }

    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] チャンネルユーザーをAPI取得: ${channelId}`);
    }

    try {
      // Get member IDs from channel
      const memberStartTime = Date.now();
      let memberIds = [];
      let cursor = undefined;

      do {
        const result = await this.client.conversations.members({
          channel: channelId,
          limit: 1000,
          cursor: cursor
        });

        if (result.members) {
          memberIds = memberIds.concat(result.members);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] メンバーID取得完了: ${Date.now() - memberStartTime}ms (${memberIds.length}件)`);
      }

      // Get user info for each member
      const userInfoStartTime = Date.now();
      const users = await this.getUsersByIds(memberIds);
      
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] ユーザー情報取得完了: ${Date.now() - userInfoStartTime}ms (${users.length}件)`);
      }

      // Cache the channel members (include all users, not just non-bots)
      this.cache.updateChannelMembers(channelId, users);
      
      return users;
    } catch (error) {
      console.error(`Failed to fetch channel users for ${channelId}:`, error.message);
      return this.cache.getChannelMembers(channelId) || [];
    }
  }

  /**
   * Search mentions in a specific channel (users, groups, and special mentions)
   */
  async searchMentions(query = '', limit = 20, channelId = null) {
    // Special mentions that always appear
    const specialMentions = [
      { id: 'channel', name: '@channel', display_name: '全員に通知', type: 'special' },
      { id: 'here', name: '@here', display_name: 'オンラインの人に通知', type: 'special' },
      { id: 'everyone', name: '@everyone', display_name: '全員に通知', type: 'special' }
    ];

    // Get usergroups
    const usergroups = await this.listUsergroups();
    const usergroupMentions = usergroups.map(ug => ({
      id: ug.id,
      name: `@${ug.name}`,
      display_name: ug.name,
      handle: ug.handle,
      real_name: `グループ: ${ug.name}`,
      type: 'usergroup'
    }));

    if (!query) {
      return [...specialMentions, ...usergroupMentions].slice(0, limit);
    }

    const lowerQuery = query.toLowerCase();

    // Filter special mentions
    const matchedSpecial = specialMentions.filter(mention =>
      mention.name.toLowerCase().includes(lowerQuery) ||
      mention.display_name.toLowerCase().includes(lowerQuery)
    );

    // Filter usergroup mentions
    const matchedUsergroups = usergroupMentions.filter(ug =>
      ug.name.toLowerCase().includes(lowerQuery) ||
      ug.display_name.toLowerCase().includes(lowerQuery) ||
      ug.handle.toLowerCase().includes(lowerQuery)
    );

    // If no channel specified, return special mentions and usergroups
    if (!channelId) {
      return [...matchedSpecial, ...matchedUsergroups].slice(0, limit);
    }

    // Get channel users
    const users = await this.listChannelUsers(channelId);

    // Filter and score users
    const matchedUsers = users
      .map(user => {
        const nameMatch = user.name.toLowerCase().includes(lowerQuery);
        const realNameMatch = user.real_name.toLowerCase().includes(lowerQuery);
        const displayNameMatch = user.display_name.toLowerCase().includes(lowerQuery);

        if (nameMatch || realNameMatch || displayNameMatch) {
          let score = 0;
          if (user.name.toLowerCase().startsWith(lowerQuery)) score += 10;
          if (nameMatch) score += 5;
          if (realNameMatch) score += 3;
          if (displayNameMatch) score += 2;

          return { ...user, type: 'user', score };
        }
        return null;
      })
      .filter(user => user !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return [...matchedSpecial, ...matchedUsergroups, ...matchedUsers].slice(0, limit);
  }

  /**
   * Format mentions in text (@user -> <@USER_ID>)
   */
  async formatMentions(text, channelId = null) {
    // Replace @username with <@USER_ID>
    let formattedText = text;

    // Special mentions
    const specialMentions = ['@channel', '@here', '@everyone'];
    for (const mention of specialMentions) {
      const mentionPattern = new RegExp(`${mention}`, 'gi');
      formattedText = formattedText.replace(mentionPattern, `<!${mention.substring(1)}>`);
    }

    // User mentions - only if channel is specified
    if (channelId) {
      const users = await this.listChannelUsers(channelId);
      
      for (const user of users) {
        const patterns = [
          new RegExp(`@${user.name}\\b`, 'gi'),
          new RegExp(`@${user.display_name}\\b`, 'gi')
        ];

        for (const pattern of patterns) {
          formattedText = formattedText.replace(pattern, `<@${user.id}>`);
        }
      }
    }

    return formattedText;
  }
}

module.exports = SlackUserAPI;
