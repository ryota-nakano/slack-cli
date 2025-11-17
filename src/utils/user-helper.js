/**
 * User Helper
 * Provides utility functions for consistent user data access
 */

class UserHelper {
  /**
   * Get display name from user object
   * Handles both Slack API response and cached user objects
   * 
   * @param {Object} user - User object (can be from API or cache)
   * @returns {string} Display name
   */
  static getDisplayName(user) {
    if (!user) return '';
    
    // Try profile.display_name first (from API response)
    if (user.profile?.display_name) return user.profile.display_name;
    
    // Try display_name (from cached objects)
    if (user.display_name) return user.display_name;
    
    // Try real_name as fallback
    if (user.real_name) return user.real_name;
    
    // Fallback to name (for special mentions like @channel)
    if (user.name) return user.name;
    
    // Last resort: user ID
    if (user.id) return user.id;
    
    return '';
  }

  /**
   * Get real name from user object
   * 
   * @param {Object} user - User object
   * @returns {string} Real name
   */
  static getRealName(user) {
    if (!user) return '';
    
    // Try real_name first
    if (user.real_name) return user.real_name;
    
    // Fallback to display_name
    if (user.display_name) return user.display_name;
    
    return '';
  }

  /**
   * Get display name with fallback for message user_profile
   * Used when processing messages that include user_profile
   * 
   * @param {Object} msg - Message object with optional user_profile
   * @param {string} userId - User ID
   * @param {Array} usersCache - Array of cached users
   * @returns {string} Display name
   */
  static getMessageUserName(msg, userId, usersCache) {
    // Try user_profile first (from message metadata)
    const profileDisplayName = msg.user_profile?.display_name?.trim();
    if (profileDisplayName) return profileDisplayName;
    
    const profileRealName = msg.user_profile?.real_name?.trim();
    if (profileRealName) return profileRealName;
    
    // Fallback to cache lookup
    if (userId && usersCache) {
      const user = usersCache.find(u => u.id === userId);
      if (user) {
        return this.getDisplayName(user);
      }
    }
    
    return userId || '';
  }

  /**
   * Format user for display (used in mention suggestions)
   * 
   * @param {Object} user - User object
   * @returns {Object} Object with displayName and realName
   */
  static formatForDisplay(user) {
    return {
      displayName: this.getDisplayName(user),
      realName: this.getRealName(user)
    };
  }

  /**
   * Check if user object has valid display information
   * 
   * @param {Object} user - User object
   * @returns {boolean} True if user has display name or name
   */
  static hasDisplayInfo(user) {
    return !!(user && (user.display_name || user.name || user.real_name));
  }
}

module.exports = UserHelper;
