/**
 * Slack Client - Unified Interface
 * Facade pattern that delegates to specialized API classes
 */

const SlackCache = require('./slack-cache');
const SlackUserAPI = require('./slack-user-api');
const SlackChannelAPI = require('./slack-channel-api');
const SlackMessageAPI = require('./slack-message-api');
const { API } = require('../utils/constants');

class SlackClient {
  constructor(token) {
    this.token = token;
    this.cache = new SlackCache();
    this.userAPI = new SlackUserAPI(token, this.cache);
    this.channelAPI = new SlackChannelAPI(token, this.cache);
    this.messageAPI = new SlackMessageAPI(token, this.userAPI);
    this.currentUserId = null;
    this.teamId = null;
  }

  // ============ User API Methods ============

  async getUserInfo(userId) {
    return this.userAPI.getUserInfo(userId);
  }

  async getCurrentUser() {
    if (!this.currentUserId) {
      const authInfo = await this.userAPI.getCurrentUser();
      this.currentUserId = authInfo.userId;
      this.teamId = authInfo.teamId;
    }
    return this.currentUserId;
  }

  async getUsergroupInfo(usergroupId) {
    return this.userAPI.getUsergroupInfo(usergroupId);
  }

  async listAllUsers(forceRefresh = false) {
    return this.userAPI.listAllUsers(forceRefresh);
  }

  async listChannelUsers(channelId, forceRefresh = false) {
    return this.userAPI.listChannelUsers(channelId, forceRefresh);
  }

  async searchMentions(query = '', limit = API.SEARCH_RESULT_LIMIT, channelId = null) {
    return this.userAPI.searchMentions(query, limit, channelId);
  }

  async formatMentions(text, channelId = null) {
    return this.userAPI.formatMentions(text, channelId);
  }

  // ============ Channel API Methods ============

  async listChannels(forceRefresh = false) {
    return this.channelAPI.listChannels(forceRefresh);
  }

  async searchChannels(query = '', limit = API.SEARCH_RESULT_LIMIT) {
    return this.channelAPI.searchChannels(query, limit);
  }

  async getChannelInfo(channelId) {
    return this.channelAPI.getChannelInfo(channelId);
  }

  async getChannelMembers(channelId) {
    return this.channelAPI.getChannelMembers(channelId);
  }

  async listDMs(forceRefresh = false) {
    return this.channelAPI.listDMs(forceRefresh);
  }

  // ============ Message API Methods ============

  async getThreadReplies(channelId, threadTs) {
    return this.messageAPI.getThreadReplies(channelId, threadTs);
  }

  async getChannelHistory(channelId, limit = null, oldest = null) {
    return this.messageAPI.getChannelHistory(channelId, limit, oldest);
  }

  async getChannelHistoryRange(channelId, oldest, latest, limit = null) {
    return this.messageAPI.getChannelHistoryRange(channelId, oldest, latest, limit);
  }

  async sendMessage(channelId, text, threadTs = null) {
    return this.messageAPI.sendMessage(channelId, text, threadTs);
  }

  async deleteMessage(channelId, ts) {
    return this.messageAPI.deleteMessage(channelId, ts);
  }

  async markAsRead(channelId, ts) {
    return this.messageAPI.markAsRead(channelId, ts);
  }

  async searchUserMessagesToday() {
    const userId = await this.getCurrentUser();
    return this.messageAPI.searchUserMessagesToday(userId);
  }

  async getReactions(limit = 100, emojiName = null) {
    const userId = await this.getCurrentUser();
    return this.messageAPI.getReactions(userId, limit, emojiName);
  }

  async removeReaction(channelId, timestamp, emojiName) {
    return this.messageAPI.removeReaction(channelId, timestamp, emojiName);
  }

  async getTeamInfo() {
    try {
      const response = await fetch('https://slack.com/api/team.info', {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error);
      }

      return data.team;
    } catch (error) {
      console.error('Failed to get team info:', error);
      throw error;
    }
  }
}

module.exports = SlackClient;
