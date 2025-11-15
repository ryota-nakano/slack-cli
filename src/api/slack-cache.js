/**
 * Slack Cache Manager
 * Handles caching of channels and users to reduce API calls
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class SlackCache {
  constructor() {
    this.cacheDir = path.join(os.homedir(), '.slack-cli');
    this.channelCacheFile = path.join(this.cacheDir, 'channels-cache.json');
    this.usersCacheFile = path.join(this.cacheDir, 'users-cache.json');
    this.channelMembersCacheFile = path.join(this.cacheDir, 'channel-members-cache.json');
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.channelCache = { channels: [], timestamp: 0 };
    this.usersCache = { users: [], timestamp: 0 };
    this.channelMembersCache = {}; // { channelId: { users: [], timestamp: 0 } }
    
    this.loadChannelCacheFromFile();
    this.loadUsersCacheFromFile();
    this.loadChannelMembersCacheFromFile();
  }

  /**
   * Load channel cache from file
   */
  loadChannelCacheFromFile() {
    try {
      if (fs.existsSync(this.channelCacheFile)) {
        const data = fs.readFileSync(this.channelCacheFile, 'utf8');
        this.channelCache = JSON.parse(data);
        
        // Check if cache is older than 1 hour
        const cacheAge = Date.now() - this.channelCache.timestamp;
        const oneHour = 60 * 60 * 1000;
        
        if (cacheAge > oneHour) {
          this.channelCache = { channels: [], timestamp: 0 };
        }
      }
    } catch (error) {
      console.error('Failed to load channel cache:', error.message);
      this.channelCache = { channels: [], timestamp: 0 };
    }
  }

  /**
   * Save channel cache to file
   */
  saveChannelCacheToFile() {
    try {
      fs.writeFileSync(
        this.channelCacheFile,
        JSON.stringify(this.channelCache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save channel cache:', error.message);
    }
  }

  /**
   * Load users cache from file
   */
  loadUsersCacheFromFile() {
    try {
      if (fs.existsSync(this.usersCacheFile)) {
        const data = fs.readFileSync(this.usersCacheFile, 'utf8');
        this.usersCache = JSON.parse(data);
        
        // Check if cache is older than 1 hour
        const cacheAge = Date.now() - this.usersCache.timestamp;
        const oneHour = 60 * 60 * 1000;
        
        if (cacheAge > oneHour) {
          this.usersCache = { users: [], timestamp: 0 };
        }
      }
    } catch (error) {
      console.error('Failed to load users cache:', error.message);
      this.usersCache = { users: [], timestamp: 0 };
    }
  }

  /**
   * Save users cache to file
   */
  saveUsersCacheToFile() {
    try {
      fs.writeFileSync(
        this.usersCacheFile,
        JSON.stringify(this.usersCache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save users cache:', error.message);
    }
  }

  /**
   * Load channel members cache from file
   */
  loadChannelMembersCacheFromFile() {
    try {
      if (fs.existsSync(this.channelMembersCacheFile)) {
        const data = fs.readFileSync(this.channelMembersCacheFile, 'utf8');
        this.channelMembersCache = JSON.parse(data);
        
        // Check and clean old caches
        const oneHour = 60 * 60 * 1000;
        for (const channelId in this.channelMembersCache) {
          const cacheAge = Date.now() - this.channelMembersCache[channelId].timestamp;
          if (cacheAge > oneHour) {
            delete this.channelMembersCache[channelId];
          }
        }
      }
    } catch (error) {
      console.error('Failed to load channel members cache:', error.message);
      this.channelMembersCache = {};
    }
  }

  /**
   * Save channel members cache to file
   */
  saveChannelMembersCacheToFile() {
    try {
      fs.writeFileSync(
        this.channelMembersCacheFile,
        JSON.stringify(this.channelMembersCache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save channel members cache:', error.message);
    }
  }

  /**
   * Get cached channels
   */
  getChannels() {
    return this.channelCache.channels;
  }

  /**
   * Update channel cache
   */
  updateChannels(channels) {
    this.channelCache = {
      channels,
      timestamp: Date.now()
    };
    this.saveChannelCacheToFile();
  }

  /**
   * Check if channel cache is valid
   */
  isChannelCacheValid() {
    return this.channelCache.channels.length > 0 && this.channelCache.timestamp > 0;
  }

  /**
   * Get cached users
   */
  getUsers() {
    return this.usersCache.users;
  }

  /**
   * Update users cache
   */
  updateUsers(users) {
    this.usersCache = {
      users,
      timestamp: Date.now()
    };
    this.saveUsersCacheToFile();
  }

  /**
   * Check if users cache is valid
   */
  isUsersCacheValid() {
    return this.usersCache.users.length > 0 && this.usersCache.timestamp > 0;
  }

  /**
   * Find user by ID from cache
   */
  findUserById(userId) {
    return this.usersCache.users.find(u => u.id === userId);
  }

  /**
   * Add a single user to cache
   */
  addUser(user) {
    const existingIndex = this.usersCache.users.findIndex(u => u.id === user.id);
    if (existingIndex >= 0) {
      this.usersCache.users[existingIndex] = user;
    } else {
      this.usersCache.users.push(user);
    }
    this.saveUsersCacheToFile();
  }

  /**
   * Get channel members from cache
   */
  getChannelMembers(channelId) {
    return this.channelMembersCache[channelId]?.users || [];
  }

  /**
   * Update channel members cache
   */
  updateChannelMembers(channelId, users) {
    this.channelMembersCache[channelId] = {
      users,
      timestamp: Date.now()
    };
    this.saveChannelMembersCacheToFile();
  }

  /**
   * Check if channel members cache is valid
   */
  isChannelMembersCacheValid(channelId) {
    const cache = this.channelMembersCache[channelId];
    if (!cache || cache.users.length === 0) {
      return false;
    }
    
    const oneHour = 60 * 60 * 1000;
    const cacheAge = Date.now() - cache.timestamp;
    return cacheAge < oneHour;
  }

  /**
   * Find channel by ID from cache
   */
  findChannelById(channelId) {
    return this.channelCache.channels.find(c => c.id === channelId);
  }
}

module.exports = SlackCache;
