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
      return result.user_id;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }
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
   * List all users (with caching)
   */
  async listAllUsers(forceRefresh = false) {
    if (!forceRefresh && this.cache.isUsersCacheValid()) {
      return this.cache.getUsers();
    }

    try {
      let users = [];
      let cursor = undefined;

      do {
        const result = await this.client.users.list({
          limit: 1000,
          cursor: cursor
        });

        if (result.members) {
          const activeUsers = result.members
            .filter(member => !member.deleted && !member.is_bot)
            .map(member => ({
              id: member.id,
              name: member.name,
              real_name: member.real_name,
              display_name: member.profile?.display_name || member.real_name,
              is_bot: member.is_bot || false
            }));

          users = users.concat(activeUsers);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      this.cache.updateUsers(users);
      return users;
    } catch (error) {
      console.error('Failed to fetch users:', error.message);
      return this.cache.getUsers();
    }
  }

  /**
   * Search mentions (users and special mentions)
   */
  async searchMentions(query = '', limit = 20) {
    const users = await this.listAllUsers();

    // Special mentions that always appear
    const specialMentions = [
      { id: 'channel', name: '@channel', display_name: '全員に通知', type: 'special' },
      { id: 'here', name: '@here', display_name: 'オンラインの人に通知', type: 'special' },
      { id: 'everyone', name: '@everyone', display_name: '全員に通知', type: 'special' }
    ];

    if (!query) {
      return specialMentions.slice(0, limit);
    }

    const lowerQuery = query.toLowerCase();

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

    // Filter special mentions
    const matchedSpecial = specialMentions.filter(mention =>
      mention.name.toLowerCase().includes(lowerQuery) ||
      mention.display_name.toLowerCase().includes(lowerQuery)
    );

    return [...matchedSpecial, ...matchedUsers].slice(0, limit);
  }

  /**
   * Format mentions in text (@user -> <@USER_ID>)
   */
  async formatMentions(text) {
    const users = await this.listAllUsers();

    // Replace @username with <@USER_ID>
    let formattedText = text;

    // Special mentions
    const specialMentions = ['@channel', '@here', '@everyone'];
    for (const mention of specialMentions) {
      const mentionPattern = new RegExp(`${mention}`, 'gi');
      formattedText = formattedText.replace(mentionPattern, `<!${mention.substring(1)}>`);
    }

    // User mentions
    for (const user of users) {
      const patterns = [
        new RegExp(`@${user.name}\\b`, 'gi'),
        new RegExp(`@${user.display_name}\\b`, 'gi')
      ];

      for (const pattern of patterns) {
        formattedText = formattedText.replace(pattern, `<@${user.id}>`);
      }
    }

    return formattedText;
  }
}

module.exports = SlackUserAPI;
