/**
 * History Display Helper
 * Handles displaying history in a grouped format (threads and channels)
 */

const chalk = require('chalk');

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
    
    // Show full text instead of truncated preview
    const fullText = item.threadPreview.text || '(no text)';
    
    // Get user name
    let userName = '';
    if (item.threadPreview.user && client) {
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
    
    const userNameDisplay = userName ? ' ' + chalk.cyan(`by ${userName}`) : '';
    
    console.log(
      chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
      chalk.gray(time) + ' ' +
      chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator + userNameDisplay
    );
    
    // Display full message text with mention formatting
    const lines = fullText.split('\n');
    for (const line of lines) {
      const formattedLine = await formatMentions(line, client);
      console.log('    ' + chalk.gray(`└─ `) + formattedLine);
    }
    console.log(''); // Add blank line after each thread
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
        
        // Show full text
        const fullText = firstMsg.text || '(no text)';
        
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
        
        // Cache the thread preview for future use
        historyManager.addConversation({
          channelId: item.channelId,
          channelName: item.channelName,
          threadTs: item.threadTs,
          type: 'thread',
          threadPreview: {
            text: fullText,
            user: firstMsg.user,
            userName: userName,
            ts: firstMsg.ts
          }
        });
        
        const reactionIndicator = item.reactions && item.reactions.length > 0
          ? ' ' + chalk.yellow(item.reactions.map(r => `:${r}:`).join(' '))
          : '';
        
        const userNameDisplay = userName ? ' ' + chalk.cyan(`by ${userName}`) : '';
        
        console.log(
          chalk.bgWhite.black(` ${item.originalIndex + 1} `) + ' ' +
          chalk.gray(time) + ' ' +
          chalk.green(item.channelName) + chalk.gray('[スレッド]') + reactionIndicator + userNameDisplay
        );
        
        // Display full message text
        const lines = fullText.split('\n');
        for (const line of lines) {
          const formattedLine = await formatMentions(line, client);
          console.log('    ' + chalk.gray(`└─ `) + formattedLine);
        }
        console.log(''); // Add blank line
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
