/**
 * History Display Helper
 * Handles displaying history in a grouped format (threads and channels)
 */

const chalk = require('chalk');
const { DISPLAY } = require('./constants');

/**
 * Format text with mentions converted to display names and highlighted in yellow
 * @param {string} text - Text to format
 * @param {Object} client - SlackClient instance for fetching user info
 * @returns {Promise<string>} Formatted text
 */
async function formatMentions(text, client = null) {
  if (!text) return '';
  
  let formattedText = text;
  
  // Convert user mentions <@U123456> to display names
  if (client) {
    const userMentionRegex = /<@([UW][A-Z0-9]+)>/g;
    const matches = [...text.matchAll(userMentionRegex)];
    
    for (const match of matches) {
      const userId = match[1];
      try {
        const userInfo = await client.getUserInfo(userId);
        const displayName = userInfo.profile?.display_name || userInfo.real_name || userInfo.name;
        formattedText = formattedText.replace(match[0], chalk.yellow(`@${displayName}`));
      } catch (error) {
        // If we can't get user info, just highlight the mention
        formattedText = formattedText.replace(match[0], chalk.yellow(match[0]));
      }
    }
  }
  
  // Highlight remaining @mentions
  formattedText = formattedText.replace(/@(\S+)/g, (match) => chalk.yellow(match));
  
  return formattedText;
}

/**
 * Display history grouped by type (threads and channels)
 * @param {Array} history - Array of history items from HistoryManager
 * @param {Object} client - SlackClient instance for fetching thread details
 * @param {Object} historyManager - HistoryManager instance for caching
 * @returns {Promise<void>}
 */
async function displayGroupedHistory(history, client = null, historyManager = null) {
  if (history.length === 0) {
    return;
  }

  // Separate into CLI threads, CLI channels, CLI DMs, and eyes reactions
  const cliThreads = [];
  const cliChannels = [];
  const cliDMs = [];
  const eyesItems = [];
  
  // Create a set of CLI thread/channel identifiers for quick lookup
  const cliIdentifiers = new Set();
  
  // Collect items with their original indices
  for (let index = 0; index < history.length; index++) {
    const item = { ...history[index], originalIndex: index };
    
    // Check if this is a reaction item (has reactions array)
    const hasEyesReaction = item.reactions && item.reactions.includes('eyes');
    
    // Check if this is from CLI (no reactions array means it's from history)
    const isFromCLI = !item.reactions;
    
    if (isFromCLI) {
      // Build identifier for this CLI item
      const identifier = item.threadTs 
        ? `${item.channelId}:${item.threadTs}` 
        : item.channelId;
      cliIdentifiers.add(identifier);
      
      if (item.type === 'thread') {
        cliThreads.push(item);
      } else if (item.type === 'dm') {
        cliDMs.push(item);
      } else {
        cliChannels.push(item);
      }
    } else if (hasEyesReaction) {
      eyesItems.push(item);
    }
  }
  
  // Filter eyes reactions to only show items NOT in CLI history
  const eyesThreads = [];
  const eyesChannels = [];
  const eyesDMs = [];
  
  for (const item of eyesItems) {
    const identifier = item.threadTs 
      ? `${item.channelId}:${item.threadTs}` 
      : item.channelId;
    
    // Only add if NOT in CLI history
    if (!cliIdentifiers.has(identifier)) {
      if (item.type === 'thread') {
        eyesThreads.push(item);
      } else if (item.channelName && item.channelName.startsWith('DM: ')) {
        eyesDMs.push(item);
      } else {
        eyesChannels.push(item);
      }
    }
  }
  
  // Display CLI threads
  if (cliThreads.length > 0) {
    console.log(chalk.bold.cyan('💬 スレッド:\n'));
    
    for (const item of cliThreads) {
      await displayThreadItem(item, client, historyManager);
    }
  }
  
  // Display CLI channels
  if (cliChannels.length > 0) {
    if (cliThreads.length > 0) {
      console.log(''); // Add blank line between sections
    }
    console.log(chalk.bold.cyan('# チャンネル:\n'));
    
    for (const item of cliChannels) {
      displayChannelItem(item);
    }
  }
  
  // Display CLI DMs
  if (cliDMs.length > 0) {
    if (cliThreads.length > 0 || cliChannels.length > 0) {
      console.log(''); // Add blank line between sections
    }
    console.log(chalk.bold.magenta('💌 DM:\n'));
    
    for (const item of cliDMs) {
      displayChannelItem(item);
    }
  }
  
  // Display eyes reactions (threads, channels, and DMs together, excluding CLI history)
  const allEyesReactions = [...eyesThreads, ...eyesChannels, ...eyesDMs];
  if (allEyesReactions.length > 0) {
    if (cliThreads.length > 0 || cliChannels.length > 0 || cliDMs.length > 0) {
      console.log(''); // Add blank line between sections
    }
    console.log(chalk.bold.yellow('👀 リアクション:\n'));
    
    for (const item of allEyesReactions) {
      if (item.type === 'thread') {
        await displayThreadItem(item, client, historyManager);
      } else {
        displayChannelItem(item);
      }
    }
  }
}

/**
 * Display a single thread item
 */
async function displayThreadItem(item, client, historyManager) {
  const time = new Date(item.timestamp).toLocaleTimeString('ja-JP', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Use cached thread preview if available
  if (item.threadPreview) {
    // Truncate text to configured length and remove newlines
    const fullText = item.threadPreview.text || '(no text)';
    const singleLine = fullText.replace(/\n/g, ' ');
    const truncatedText = singleLine.length > DISPLAY.TEXT_PREVIEW_LENGTH 
      ? singleLine.substring(0, DISPLAY.TEXT_PREVIEW_LENGTH) + '...' 
      : singleLine;
    
    // Get user name - prefer cached userName, then fetch from API
    let userName = item.threadPreview.userName || '';
    if (!userName && item.threadPreview.user && client) {
      try {
        const userInfo = await client.getUserInfo(item.threadPreview.user);
        userName = userInfo.profile?.display_name || userInfo.real_name || userInfo.name;
      } catch (error) {
        userName = item.threadPreview.user;
      }
    }
    
    // Show reactions if available
    const reactionIndicator = item.reactions && item.reactions.length > 0
      ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
      : '';
    
    // Display on one line: Number, time, channel, reactions, user name, text preview
    console.log(
      chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
      chalk.gray(time) + ' ' +
      chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator + ' ' +
      chalk.green(userName) + ' ' +
      truncatedText
    );
  } else if (client && historyManager) {
    // Fallback to API call if no cache and client is available
    try {
      const replies = await client.getThreadReplies(item.channelId, item.threadTs);
      if (replies && replies.length > 0) {
        const firstMsg = replies[0];
        
        // Get full text, truncate to configured length and remove newlines
        const fullText = firstMsg.text || '(no text)';
        const singleLine = fullText.replace(/\n/g, ' ');
        const truncatedText = singleLine.length > DISPLAY.TEXT_PREVIEW_LENGTH 
          ? singleLine.substring(0, DISPLAY.TEXT_PREVIEW_LENGTH) + '...' 
          : singleLine;
        
        // Get user name
        let userName = '';
        if (firstMsg.user) {
          try {
            const userInfo = await client.getUserInfo(firstMsg.user);
            userName = userInfo.profile?.display_name || userInfo.real_name || userInfo.name;
          } catch (error) {
            userName = firstMsg.user;
          }
        }
        
        // Cache the thread preview for future use (store full text)
        historyManager.addConversation({
          channelId: item.channelId,
          channelName: item.channelName,
          threadTs: item.threadTs,
          type: 'thread',
          threadPreview: {
            text: fullText,  // Cache full text
            user: firstMsg.user,
            userName: userName,
            ts: firstMsg.ts
          }
        });
        
        const reactionIndicator = item.reactions && item.reactions.length > 0
          ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
          : '';
        
        // Display on one line: Number, time, channel, reactions, user name, text preview
        console.log(
          chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
          chalk.gray(time) + ' ' +
          chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator + ' ' +
          chalk.green(userName) + ' ' +
          truncatedText
        );
      }
    } catch (error) {
      // Fallback if we can't get thread details
      const reactionIndicator = item.reactions && item.reactions.length > 0
        ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
        : '';
      console.log(
        chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
        chalk.gray(time) + ' ' +
        chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator
      );
    }
  } else {
    // No preview and no client - just show basic info
    console.log(
      chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
      chalk.gray(time) + ' ' +
      chalk.green(item.channelName) + chalk.gray('[スレッド]')
    );
  }
}

/**
 * Display a single channel item
 */
function displayChannelItem(item) {
  const time = new Date(item.timestamp).toLocaleTimeString('ja-JP', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Show reactions if available
  const reactionIndicator = item.reactions && item.reactions.length > 0
    ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
    : '';
  
  console.log(
    chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
    chalk.gray(time) + ' ' +
    chalk.green(item.channelName) + reactionIndicator
  );
}

module.exports = {
  displayGroupedHistory
};
