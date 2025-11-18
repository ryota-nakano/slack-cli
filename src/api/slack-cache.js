/**
 * Slack Cache Manager
 * Handles caching of channels and users to reduce API calls
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { CACHE } = require('../utils/constants');

class SlackCache {
  constructor() {
    this.cacheDir = path.join(os.homedir(), '.slack-cli');
    this.channelCacheFile = path.join(this.cacheDir, 'channels-cache.json');
    this.dmCacheFile = path.join(this.cacheDir, 'dms-cache.json');
    this.usersCacheFile = path.join(this.cacheDir, 'users-cache.json');
    this.channelMembersCacheFile = path.join(this.cacheDir, 'channel-members-cache.json');
    this.usergroupsCacheFile = path.join(this.cacheDir, 'usergroups-cache.json');
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.channelCache = { channels: [], timestamp: 0 };
    this.dmCache = { dms: [], timestamp: 0 };
    this.usersCache = { users: [], timestamp: 0 };
    this.channelMembersCache = {}; // { channelId: { users: [], timestamp: 0 } }
    this.usergroupsCache = { usergroups: [], timestamp: 0 };
    
    this.loadChannelCacheFromFile();
    this.loadDMCacheFromFile();
    this.loadUsersCacheFromFile();
    this.loadChannelMembersCacheFromFile();
    this.loadUsergroupsCacheFromFile();
  }

  /**
   * Load channel cache from file
   */
  loadChannelCacheFromFile() {
    try {
      if (fs.existsSync(this.channelCacheFile)) {
        const data = fs.readFileSync(this.channelCacheFile, 'utf8');
        this.channelCache = JSON.parse(data);
        
        // Check if cache is older than configured TTL
        const cacheAge = Date.now() - this.channelCache.timestamp;
        
        if (cacheAge > CACHE.TTL) {
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
        
        
        if (cacheAge > CACHE.TTL) {
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
        
        for (const channelId in this.channelMembersCache) {
          const cacheAge = Date.now() - this.channelMembersCache[channelId].timestamp;
          if (cacheAge > CACHE.TTL) {
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
    
    
    const cacheAge = Date.now() - cache.timestamp;
    return cacheAge < oneHour;
  }

  /**
   * Find channel by ID from cache
   */
  findChannelById(channelId) {
    return this.channelCache.channels.find(c => c.id === channelId);
  }

  /**
   * Load usergroups cache from file
   */
  loadUsergroupsCacheFromFile() {
    try {
      if (fs.existsSync(this.usergroupsCacheFile)) {
        const data = fs.readFileSync(this.usergroupsCacheFile, 'utf8');
        this.usergroupsCache = JSON.parse(data);
        
        // Check if cache is older than 1 hour
        const cacheAge = Date.now() - this.usergroupsCache.timestamp;
        
        
        if (cacheAge > CACHE.TTL) {
          this.usergroupsCache = { usergroups: [], timestamp: 0 };
        }
      }
    } catch (error) {
      console.error('Failed to load usergroups cache:', error.message);
      this.usergroupsCache = { usergroups: [], timestamp: 0 };
    }
  }

  /**
   * Save usergroups cache to file
   */
  saveUsergroupsCacheToFile() {
    try {
      fs.writeFileSync(
        this.usergroupsCacheFile,
        JSON.stringify(this.usergroupsCache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save usergroups cache:', error.message);
    }
  }

  /**
   * Get cached usergroups
   */
  getUsergroups() {
    return this.usergroupsCache.usergroups;
  }

  /**
   * Update usergroups cache
   */
  updateUsergroups(usergroups) {
    this.usergroupsCache = {
      usergroups,
      timestamp: Date.now()
    };
    this.saveUsergroupsCacheToFile();
  }

  /**
   * Check if usergroups cache is valid
   */
  isUsergroupsCacheValid() {
    return this.usergroupsCache.usergroups.length > 0 && this.usergroupsCache.timestamp > 0;
  }

  /**
   * Load DM cache from file
   */
  loadDMCacheFromFile() {
    try {
      if (fs.existsSync(this.dmCacheFile)) {
        const data = fs.readFileSync(this.dmCacheFile, 'utf8');
        this.dmCache = JSON.parse(data);
        
        // Check if cache is older than 1 hour
        const cacheAge = Date.now() - this.dmCache.timestamp;
        
        
        if (cacheAge > CACHE.TTL) {
          this.dmCache = { dms: [], timestamp: 0 };
        }
      }
    } catch (error) {
      console.error('Failed to load DM cache:', error.message);
      this.dmCache = { dms: [], timestamp: 0 };
    }
  }

  /**
   * Save DM cache to file
   */
  saveDMCacheToFile() {
    try {
      fs.writeFileSync(
        this.dmCacheFile,
        JSON.stringify(this.dmCache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save DM cache:', error.message);
    }
  }

  /**
   * Get cached DMs
   */
  getDMs() {
    return this.dmCache.dms;
  }

  /**
   * Update DM cache
   */
  updateDMs(dms) {
    this.dmCache = {
      dms,
      timestamp: Date.now()
    };
    this.saveDMCacheToFile();
  }

  /**
   * Check if DM cache is valid
   */
  isDMCacheValid() {
    return this.dmCache.dms.length > 0 && this.dmCache.timestamp > 0;
  }
}

module.exports = SlackCache;
