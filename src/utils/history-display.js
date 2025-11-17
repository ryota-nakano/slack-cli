/**
 * History Display Helper
 * Handles displaying history in a grouped format (threads and channels)
 */

const chalk = require('chalk');

/**
 * Format text with mentions highlighted in yellow
 */
function formatMentions(text) {
  if (!text) return '';
  
  // Highlight @mentions in yellow
  return text.replace(/@(\S+)/g, (match) => chalk.yellow(match));
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

  // Separate into CLI threads, CLI channels, and eyes reactions
  const cliThreads = [];
  const cliChannels = [];
  const eyesThreads = [];
  const eyesChannels = [];
  
  // Collect items with their original indices
  for (let index = 0; index < history.length; index++) {
    const item = { ...history[index], originalIndex: index };
    
    // Check if this is a reaction item (has reactions array)
    const hasEyesReaction = item.reactions && item.reactions.includes('eyes');
    
    // Check if this is from CLI (no reactions array means it's from history)
    const isFromCLI = !item.reactions;
    
    if (hasEyesReaction) {
      if (item.type === 'thread') {
        eyesThreads.push(item);
      } else {
        eyesChannels.push(item);
      }
    } else if (isFromCLI) {
      if (item.type === 'thread') {
        cliThreads.push(item);
      } else {
        cliChannels.push(item);
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
  
  // Display eyes reactions (threads and channels together)
  const allEyesReactions = [...eyesThreads, ...eyesChannels];
  if (allEyesReactions.length > 0) {
    if (cliThreads.length > 0 || cliChannels.length > 0) {
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
    const msgTime = new Date(parseFloat(item.threadPreview.ts) * 1000).toLocaleTimeString('ja-JP', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    const previewText = item.threadPreview.text.length > 30 
      ? item.threadPreview.text.substring(0, 30) + '...' 
      : item.threadPreview.text;
    
    // Show reactions if available
    const reactionIndicator = item.reactions && item.reactions.length > 0
      ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
      : '';
    
    console.log(
      chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
      chalk.gray(time) + ' ' +
      chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator
    );
    console.log(
      '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + formatMentions(previewText)
    );
  } else if (client && historyManager) {
    // Fallback to API call if no cache and client is available
    try {
      const replies = await client.getThreadReplies(item.channelId, item.threadTs);
      if (replies && replies.length > 0) {
        const firstMsg = replies[0];
        const msgTime = new Date(parseFloat(firstMsg.ts) * 1000).toLocaleTimeString('ja-JP', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        });
        const firstLine = firstMsg.text.split('\n')[0];
        const previewText = firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine;
        
        // Cache the thread preview for future use
        historyManager.addConversation({
          channelId: item.channelId,
          channelName: item.channelName,
          threadTs: item.threadTs,
          type: 'thread',
          threadPreview: {
            text: firstLine,
            user: firstMsg.user,
            userName: firstMsg.userName || '',
            ts: firstMsg.ts
          }
        });
        
        console.log(
          chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
          chalk.gray(time) + ' ' +
          chalk.green(item.channelName) + chalk.gray('[スレッド]')
        );
        console.log(
          '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + formatMentions(previewText)
        );
      }
    } catch (error) {
      // Fallback if we can't get thread details
      console.log(
        chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
        chalk.gray(time) + ' ' +
        chalk.green(item.channelName) + chalk.gray('[スレッド]')
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
