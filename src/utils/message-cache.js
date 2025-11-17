/**
 * Message Cache Manager
 * Cache thread and channel messages for better performance
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.slack-cli', 'cache');
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class MessageCache {
  constructor() {
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Get cache file path for a conversation
   */
  getCacheFilePath(channelId, threadTs = null) {
    const key = threadTs ? `${channelId}-${threadTs}` : channelId;
    return path.join(CACHE_DIR, `${key}.json`);
  }

  /**
   * Get cached messages if available and not expired
   */
  get(channelId, threadTs = null) {
    try {
      const cacheFile = this.getCacheFilePath(channelId, threadTs);
      
      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const data = fs.readFileSync(cacheFile, 'utf8');
      const cached = JSON.parse(data);
      
      // Check if cache is expired
      const now = Date.now();
      if (now - cached.timestamp > CACHE_DURATION) {
        // Cache expired, delete it
        fs.unlinkSync(cacheFile);
        return null;
      }
      
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュヒット: ${channelId}${threadTs ? `-${threadTs}` : ''} (${cached.messages.length}件)`);
      }
      
      return cached.messages;
    } catch (error) {
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュ読み込みエラー: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Save messages to cache
   */
  set(channelId, messages, threadTs = null) {
    try {
      const cacheFile = this.getCacheFilePath(channelId, threadTs);
      
      const cacheData = {
        timestamp: Date.now(),
        channelId,
        threadTs,
        messages
      };
      
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData), 'utf8');
      
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュ保存: ${channelId}${threadTs ? `-${threadTs}` : ''} (${messages.length}件)`);
      }
    } catch (error) {
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュ保存エラー: ${error.message}`);
      }
    }
  }

  /**
   * Invalidate cache for a conversation
   */
  invalidate(channelId, threadTs = null) {
    try {
      const cacheFile = this.getCacheFilePath(channelId, threadTs);
      
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        
        if (process.env.DEBUG_CACHE) {
          console.error(`[DEBUG] キャッシュ削除: ${channelId}${threadTs ? `-${threadTs}` : ''}`);
        }
      }
    } catch (error) {
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュ削除エラー: ${error.message}`);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearAll() {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
          deletedCount++;
        }
      }
      
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] すべてのキャッシュを削除しました (${deletedCount}件)`);
      }
      
      return deletedCount;
    } catch (error) {
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] キャッシュ一括削除エラー: ${error.message}`);
      }
      return 0;
    }
  }

  /**
   * Clean up expired caches
   */
  cleanExpired() {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      const now = Date.now();
      let deletedCount = 0;
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(CACHE_DIR, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const cached = JSON.parse(data);
          
          if (now - cached.timestamp > CACHE_DURATION) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          // Skip invalid cache files
        }
      }
      
      if (process.env.DEBUG_CACHE && deletedCount > 0) {
        console.error(`[DEBUG] 期限切れキャッシュを削除しました (${deletedCount}件)`);
      }
    } catch (error) {
      if (process.env.DEBUG_CACHE) {
        console.error(`[DEBUG] 期限切れキャッシュ削除エラー: ${error.message}`);
      }
    }
  }
}

module.exports = MessageCache;
