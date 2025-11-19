/**
 * Application Constants
 * Centralized configuration values that can be overridden via environment variables
 */

/**
 * Parse integer from environment variable with default fallback
 */
function getEnvInt(key, defaultValue) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Display Settings
const DISPLAY = {
  // Initial number of messages to display
  INITIAL_MESSAGE_COUNT: getEnvInt('INITIAL_MESSAGE_COUNT', 30),
  
  // Number of messages to add when showing more
  MESSAGE_INCREMENT: getEnvInt('MESSAGE_INCREMENT', 30),
  
  // Maximum length for text previews
  TEXT_PREVIEW_LENGTH: getEnvInt('TEXT_PREVIEW_LENGTH', 100),
  
  // Width for UI elements
  SEPARATOR_WIDTH: 80,
  CHANNEL_NAME_WIDTH: 30,
  
  // Token masking
  TOKEN_PREFIX_LENGTH: 10,
  TOKEN_SUFFIX_LENGTH: 4,
};

// History Settings
const HISTORY = {
  // Maximum number of history entries to keep
  LIMIT: getEnvInt('HISTORY_LIMIT', 20),
};

// Cache Settings
const CACHE = {
  // Cache Time-To-Live in milliseconds (default: 1 hour)
  TTL: getEnvInt('CACHE_TTL', 60 * 60 * 1000),
};

// API/Search Settings
const API = {
  // Default limit for search results
  SEARCH_RESULT_LIMIT: getEnvInt('SEARCH_RESULT_LIMIT', 20),
  
  // Limit for mention search results
  MENTION_SEARCH_LIMIT: getEnvInt('MENTION_SEARCH_LIMIT', 10),
  
  // Limit for reaction fetching
  REACTION_FETCH_LIMIT: getEnvInt('REACTION_FETCH_LIMIT', 20),
  
  // Maximum number of users to fetch in batch
  USER_BATCH_LIMIT: getEnvInt('USER_BATCH_LIMIT', 50),
};

// Scoring for mention search
const SCORING = {
  // Score bonus for name prefix match
  NAME_PREFIX_BONUS: 10,
};

// Full-width to half-width number conversion offset
const FULLWIDTH_NUMBER_OFFSET = 0xFEE0;

module.exports = {
  DISPLAY,
  HISTORY,
  CACHE,
  API,
  SCORING,
  FULLWIDTH_NUMBER_OFFSET,
};
