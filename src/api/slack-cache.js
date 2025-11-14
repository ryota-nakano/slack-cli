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
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.channelCache = { channels: [], timestamp: 0 };
    this.usersCache = { users: [], timestamp: 0 };
    
    this.loadChannelCacheFromFile();
    this.loadUsersCacheFromFile();
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
   * Find channel by ID from cache
   */
  findChannelById(channelId) {
    return this.channelCache.channels.find(c => c.id === channelId);
  }
}

module.exports = SlackCache;
