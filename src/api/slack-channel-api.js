/**
 * Slack Channel API
 * Handles channel-related operations
 */

const { WebClient } = require('@slack/web-api');

class SlackChannelAPI {
  constructor(token, cache) {
    this.client = new WebClient(token);
    this.cache = cache;
  }

  /**
   * List all channels (with caching)
   */
  async listChannels(forceRefresh = false) {
    if (!forceRefresh && this.cache.isChannelCacheValid()) {
      return this.cache.getChannels();
    }

    try {
      let channels = [];
      let cursor = undefined;

      do {
        const result = await this.client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 1000,
          cursor: cursor
        });

        if (result.channels) {
          const mappedChannels = result.channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            is_private: channel.is_private || false,
            is_member: channel.is_member || false,
            is_archived: channel.is_archived || false,
            topic: channel.topic?.value || '',
            purpose: channel.purpose?.value || ''
          }));

          channels = channels.concat(mappedChannels);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      this.cache.updateChannels(channels);
      return channels;
    } catch (error) {
      console.error('Failed to fetch channels:', error.message);
      return this.cache.getChannels();
    }
  }

  /**
   * Search channels by query
   */
  async searchChannels(query = '', limit = 20) {
    const channels = await this.listChannels();

    if (!query) {
      return channels.slice(0, limit);
    }

    const lowerQuery = query.toLowerCase();

    return channels
      .filter(channel =>
        channel.name.toLowerCase().includes(lowerQuery) ||
        channel.topic.toLowerCase().includes(lowerQuery) ||
        channel.purpose.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => {
        const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery);
        const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }

  /**
   * Get channel information by channel ID
   */
  async getChannelInfo(channelId) {
    // Check cache first
    const cachedChannel = this.cache.findChannelById(channelId);
    if (cachedChannel) {
      return cachedChannel;
    }

    try {
      const result = await this.client.conversations.info({
        channel: channelId
      });

      if (result.channel) {
        return {
          id: result.channel.id,
          name: result.channel.name,
          is_private: result.channel.is_private || false,
          is_member: result.channel.is_member || false,
          is_archived: result.channel.is_archived || false
        };
      }
    } catch (error) {
      console.error(`Failed to fetch channel info for ${channelId}:`, error.message);
    }

    return null;
  }

  /**
   * Get channel members
   */
  async getChannelMembers(channelId) {
    try {
      let members = [];
      let cursor = undefined;

      do {
        const result = await this.client.conversations.members({
          channel: channelId,
          limit: 1000,
          cursor: cursor
        });

        if (result.members) {
          members = members.concat(result.members);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      return members;
    } catch (error) {
      console.error('Failed to fetch channel members:', error.message);
      return [];
    }
  }

  /**
   * List all DMs (Direct Messages) with caching
   * Includes both 1:1 DMs (im) and multi-person DMs (mpim)
   */
  async listDMs(forceRefresh = false) {
    if (!forceRefresh && this.cache.isDMCacheValid()) {
      return this.cache.getDMs();
    }

    try {
      let dms = [];
      let cursor = undefined;

      do {
        const result = await this.client.conversations.list({
          types: 'im,mpim',
          exclude_archived: true,
          limit: 1000,
          cursor: cursor
        });

        if (result.channels) {
          dms = dms.concat(result.channels);
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      this.cache.updateDMs(dms);
      return dms;
    } catch (error) {
      console.error('Failed to fetch DMs:', error.message);
      return this.cache.getDMs();
    }
  }
}

module.exports = SlackChannelAPI;
