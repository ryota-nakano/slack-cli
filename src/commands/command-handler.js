/**
 * Command Handlers for Chat Session
 * Handles various slash commands in chat
 */

const chalk = require('chalk');
const { displayGroupedHistory } = require('../utils/history-display');

class CommandHandler {
  constructor(chatSession) {
    this.session = chatSession;
    this.client = chatSession.client;
    this.historyManager = chatSession.historyManager;
    this.messageCache = chatSession.messageCache;
  }

  /**
   * Handle /delete or /rm command for messages
   * Supports multiple message deletion: /rm 1 3 5
   */
  async handleDeleteMessage(msgNumbers) {
    const parts = msgNumbers.split(' ').filter(p => p.trim());
    const numbers = parts.map(p => parseInt(p, 10)).filter(n => !isNaN(n));
    
    if (numbers.length === 0) {
      console.log(chalk.yellow('\n⚠️  削除する番号を指定してください（例: /rm 1 3 5）'));
      return;
    }
    
    // Sort numbers in descending order to delete from bottom to top
    // This prevents index shifting issues
    const sortedNumbers = [...new Set(numbers)].sort((a, b) => b - a);
    const deletedMessages = [];
    const invalidNumbers = [];
    const failedDeletes = [];
    
    for (const num of sortedNumbers) {
      if (num < 1 || num > this.session.messages.length) {
        invalidNumbers.push(num);
        continue;
      }
      
      const message = this.session.messages[num - 1];
      
      try {
        await this.client.deleteMessage(this.session.channelId, message.ts);
        deletedMessages.push(num);
      } catch (error) {
        failedDeletes.push({ num, error: error.message });
      }
    }
    
    // Show results
    if (deletedMessages.length > 0) {
      console.log(chalk.green(`\n✅ ${deletedMessages.length}件のメッセージを削除しました: ${deletedMessages.sort((a, b) => a - b).join(', ')}`));
    }
    
    if (invalidNumbers.length > 0) {
      console.log(chalk.yellow(`\n⚠️  存在しない番号: ${invalidNumbers.join(', ')}`));
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.session.messages.length}`));
    }
    
    if (failedDeletes.length > 0) {
      console.log(chalk.red(`\n❌ 削除失敗: ${failedDeletes.map(f => f.num).join(', ')}`));
      console.log(chalk.yellow('💡 ヒント: 自分のメッセージか、適切な権限が必要です'));
    }
    
    // Refresh messages if any were deleted
    if (deletedMessages.length > 0) {
      await this.session.fetchMessages();
      this.session.displayMessages();
    }
  }

  /**
   * Handle /history command (channel only)
   * Fetch and display older message history
   */
  async handleHistory(limit) {
    console.log(chalk.cyan(`\n📜 直近${limit}件の履歴を取得中...\n`));
    // When using /history command with limit, fetch from beginning (oldest = 0)
    this.session.messages = await this.client.getChannelHistory(this.session.channelId, limit, 0);
    this.session.displayMessages();
  }

  /**
   * Handle /refresh command
   * Search for today's user messages and add to history
   */
  async refreshTodaysPosts() {
    console.log(chalk.cyan('\n🔍 今日の投稿を検索中...\n'));
    
    const userConversations = await this.client.searchUserMessagesToday();
    
    if (userConversations.length === 0) {
      console.log(chalk.yellow('💡 今日の新しい投稿は見つかりませんでした\n'));
      return;
    }
    
    console.log(chalk.green(`✅ ${userConversations.length}件の会話を見つけました\n`));
    
    // Add found conversations to history
    for (const conv of userConversations) {
      let threadPreview = null;
      
      if (conv.type === 'thread') {
        // Fetch thread to get the full first message
        try {
          const replies = await this.client.getThreadReplies(conv.channelId, conv.threadTs);
          if (replies && replies.length > 0) {
            const firstMsg = replies[0];
            threadPreview = {
              text: firstMsg.text || '',
              user: firstMsg.user,
              userName: firstMsg.userName || '',
              ts: firstMsg.ts
            };
          }
        } catch (error) {
          // Fallback to search result text if thread fetch fails
          threadPreview = {
            text: conv.text || '',
            user: '',
            userName: '',
            ts: conv.threadTs
          };
        }
      }
      
      this.historyManager.addConversation({
        channelId: conv.channelId,
        channelName: conv.channelName,
        threadTs: conv.threadTs,
        type: conv.type,
        threadPreview
      });
    }
    
    console.log(chalk.cyan('💾 履歴を更新しました\n'));
  }

  /**
   * Handle /recent command
   * Show recent conversation history and let user select
   */
  async showRecentHistory() {
    const history = this.historyManager.getTodayHistory();
    
    // Get recent :eyes: reactions only (limit to 20 to keep it relevant)
    const reactions = await this.client.getReactions(20, 'eyes');
    
    // Merge reactions with history
    const mergedHistory = [...history];
    
    for (const item of reactions) {
      // Check if this item is already in history
      const exists = mergedHistory.some(h => 
        h.channelId === item.channelId && h.threadTs === item.threadTs
      );
      
      if (!exists) {
        // Add reaction item with current timestamp
        mergedHistory.unshift({
          channelId: item.channelId,
          channelName: item.channelName,
          threadTs: item.threadTs,
          type: item.type,
          timestamp: new Date().toISOString(),
          threadPreview: item.threadPreview || null,
          reactions: item.reactions
        });
      }
    }
    
    if (mergedHistory.length === 0) {
      console.log(chalk.yellow('\n💡 履歴と :eyes: リアクションがありません'));
      return;
    }

    await displayGroupedHistory(mergedHistory, this.client, this.historyManager);
    console.log(chalk.gray('\n💡 ヒント: /数字 で移動（例: /1）\n'));
    
    // Store merged history for navigation
    this.session.recentHistory = mergedHistory;
    this.session.showingRecentHistory = true; // Set flag for next command
  }

  /**
   * Handle entering a thread from channel
   */
  async enterThread(msgNumber) {
    const num = parseInt(msgNumber, 10);
    
    if (isNaN(num) || num < 1 || num > this.session.messages.length) {
      console.log(chalk.red(`\n❌ 無効なメッセージ番号: ${msgNumber}`));
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.session.messages.length}`));
      return;
    }

    const message = this.session.messages[num - 1];
    
    if (!message.thread_ts) {
      console.log(chalk.yellow('\n💡 このメッセージにはスレッドがありません'));
      return;
    }

    // Save current conversation to history
    this.historyManager.addConversation({
      channelId: this.session.channelId,
      channelName: this.session.channelName,
      threadTs: null,
      type: 'channel'
    });

    console.log(chalk.cyan(`\n📂 スレッドに入ります...\n`));
    
    // Create new thread session
    const ChatSession = require('./thread');
    const threadSession = new ChatSession.ChatSession(
      this.session.channelId, 
      this.session.channelName, 
      message.thread_ts
    );
    
    // Stop current session
    this.session.cleanup(false);
    
    // Start thread session
    await threadSession.start();
  }

  /**
   * Handle going back to channel from thread
   */
  async backToChannel() {
    if (!this.session.isThread()) {
      console.log(chalk.yellow('\n💡 すでにチャンネルにいます'));
      return;
    }

    // Save thread to history before going back
    // Get first message from session if available
    let threadPreview = null;
    if (this.session.messages && this.session.messages.length > 0) {
      const firstMsg = this.session.messages[0];
      threadPreview = {
        text: firstMsg.text || '',
        user: firstMsg.user,
        userName: firstMsg.userName || '',
        ts: firstMsg.ts
      };
    }
    
    this.historyManager.addConversation({
      channelId: this.session.channelId,
      channelName: this.session.channelName,
      threadTs: this.session.threadTs,
      type: 'thread',
      threadPreview
    });

    console.log(chalk.cyan(`\n📂 チャンネルに戻ります...\n`));
    
    // Create new channel session
    const ChatSession = require('./thread');
    const channelSession = new ChatSession.ChatSession(
      this.session.channelId, 
      this.session.channelName
    );
    
    // Stop current session
    this.session.cleanup(false);
    
    // Start channel session
    await channelSession.start();
  }

  /**
   * Handle switching to another channel
   */
  async switchToChannel(channel) {
    // Save current conversation to history
    this.historyManager.addConversation({
      channelId: this.session.channelId,
      channelName: this.session.channelName,
      threadTs: this.session.threadTs,
      type: this.session.isThread() ? 'thread' : 'channel'
    });

    console.log(chalk.cyan(`\n📂 ${channel.name} に切り替えています...\n`));
    
    // Create new session for the channel
    const ChatSession = require('./thread');
    const newSession = new ChatSession.ChatSession(channel.id, channel.name);
    
    // Stop current session
    this.session.cleanup(false);
    
    // Start new session
    await newSession.start();
  }
}

module.exports = CommandHandler;
