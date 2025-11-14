/**
 * Slack Client - Unified Interface
 * Facade pattern that delegates to specialized API classes
 */

const SlackCache = require('./slack-cache');
const SlackUserAPI = require('./slack-user-api');
const SlackChannelAPI = require('./slack-channel-api');
const SlackMessageAPI = require('./slack-message-api');

class SlackClient {
  constructor(token) {
    this.token = token;
    this.cache = new SlackCache();
    this.userAPI = new SlackUserAPI(token, this.cache);
    this.channelAPI = new SlackChannelAPI(token, this.cache);
    this.messageAPI = new SlackMessageAPI(token);
    this.currentUserId = null;
  }

  // ============ User API Methods ============

  async getUserInfo(userId) {
    return this.userAPI.getUserInfo(userId);
  }

  async getCurrentUser() {
    if (!this.currentUserId) {
      this.currentUserId = await this.userAPI.getCurrentUser();
    }
    return this.currentUserId;
  }

  async getUsergroupInfo(usergroupId) {
    return this.userAPI.getUsergroupInfo(usergroupId);
  }

  async listAllUsers(forceRefresh = false) {
    return this.userAPI.listAllUsers(forceRefresh);
  }

  async searchMentions(query = '', limit = 20) {
    return this.userAPI.searchMentions(query, limit);
  }

  async formatMentions(text) {
    return this.userAPI.formatMentions(text);
  }

  // ============ Channel API Methods ============

  async listChannels(forceRefresh = false) {
    return this.channelAPI.listChannels(forceRefresh);
  }

  async searchChannels(query = '', limit = 20) {
    return this.channelAPI.searchChannels(query, limit);
  }

  async getChannelInfo(channelId) {
    return this.channelAPI.getChannelInfo(channelId);
  }

  async getChannelMembers(channelId) {
    return this.channelAPI.getChannelMembers(channelId);
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
}

module.exports = SlackClient;
