/**
 * Unified Chat Session
 * Handles both channel and thread chats seamlessly
 */

const chalk = require('chalk');
const SlackClient = require('../api/slack-client');
const ReadlineInput = require('../ui/readline-input');
const EditorInput = require('../ui/editor-input');
const ThreadDisplay = require('../ui/thread-display');
const HistoryManager = require('../utils/history-manager');
const MessageCache = require('../utils/message-cache');
const { displayGroupedHistory } = require('../utils/history-display');
const CommandHandler = require('./command-handler');

class ChatSession {
  constructor(channelId, channelName, threadTs = null) {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    this.client = new SlackClient(token);
    this.channelId = channelId;
    this.channelName = channelName;
    this.threadTs = threadTs; // null = channel chat, value = thread chat
    this.currentUser = null;
    this.messages = [];
    this.lastDisplayedCount = 0;
    this.updateInterval = null;
    this.display = null;
    this.currentDate = null; // Track current viewing date (for channels only)
    this.daysBack = 0; // 0 = today, 1 = yesterday, etc.
    this.historyManager = new HistoryManager();
    this.messageCache = new MessageCache();
    this.showingRecentHistory = false; // Track if /recent was just shown
    this.commandHandler = new CommandHandler(this); // Command handler
  }

  /**
   * Check if this is a thread context
   */
  isThread() {
    return this.threadTs !== null;
  }

  /**
   * Get context display name
   */
  getContextName() {
    return this.isThread() ? `${this.channelName}[スレッド]` : `${this.channelName}`;
  }

  /**
   * Initialize and start chat session
   */
  async start() {
    const contextType = this.isThread() ? 'スレッド' : 'チャンネル';
    console.log(chalk.cyan(`🔄 ${contextType}情報を取得中...\n`));

    this.display = new ThreadDisplay(this.getContextName());

    // Get current user
    this.currentUser = await this.client.getCurrentUser();

    // Get initial messages
    await this.fetchMessages();
    this.lastDisplayedCount = this.messages.length;

    // Display messages
    this.displayMessages();

    // Prepare thread preview for caching
    let threadPreview = null;
    if (this.isThread() && this.messages.length > 0) {
      const firstMsg = this.messages[0];
      const text = firstMsg.text || '';
      const firstLine = text.split('\n')[0].substring(0, 50);
      threadPreview = {
        text: firstLine,
        user: firstMsg.user,
        userName: firstMsg.userName || '',
        ts: firstMsg.ts
      };
    }

    // Record this conversation in history
    this.historyManager.addConversation({
      channelId: this.channelId,
      channelName: this.channelName,
      threadTs: this.threadTs,
      type: this.isThread() ? 'thread' : 'channel',
      threadPreview
    });

    // Start update polling
    this.updateInterval = setInterval(() => this.checkUpdates(), 10000);

    // Handle Ctrl+C
    process.removeAllListeners('SIGINT');
    process.on('SIGINT', () => this.cleanup());

    // Start input loop
    await this.inputLoop();
  }

  /**
   * Fetch messages based on context
   */
  async fetchMessages(limit = null, daysBack = null) {
    if (this.isThread()) {
      // Try to get from cache first
      const cached = this.messageCache.get(this.channelId, this.threadTs);
      if (cached) {
        this.messages = cached;
        return;
      }
      
      // For threads, get all replies (no date filtering)
      this.messages = await this.client.getThreadReplies(this.channelId, this.threadTs);
      
      // Save to cache
      this.messageCache.set(this.channelId, this.messages, this.threadTs);
    } else {
      // For channels, don't cache (messages change frequently by date)
      // Use daysBack parameter or instance variable
      const days = daysBack !== null ? daysBack : this.daysBack;
      
      // Calculate oldest timestamp based on days back
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - days);
      targetDate.setHours(0, 0, 0, 0);
      const oldest = targetDate.getTime() / 1000;
      
      // Calculate newest timestamp (end of that day)
      const newestDate = new Date(targetDate);
      newestDate.setHours(23, 59, 59, 999);
      const newest = newestDate.getTime() / 1000;
      
      this.currentDate = targetDate;
      this.messages = await this.client.getChannelHistoryRange(this.channelId, oldest, newest, limit);
    }
  }

  /**
   * Check for new messages
   */
  async checkUpdates() {
    try {
      const oldCount = this.messages.length;
      await this.fetchMessages();

      if (this.messages.length > oldCount) {
        this.displayNewMessages();
        // Update history timestamp when new messages arrive
        this.updateHistoryTimestamp();
      }
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Display all messages
   */
  displayMessages() {
    // Show current viewing date for channels
    if (!this.isThread() && this.currentDate) {
      const dateStr = this.currentDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short'
      });
      console.log(chalk.cyan(`\n📅 ${dateStr}の履歴`));
      if (this.daysBack > 0) {
        console.log(chalk.gray(`   (${this.daysBack}日前)`));
      }
    }
    
    this.display.displayMessages(this.messages);
    this.lastDisplayedCount = this.messages.length;
    
    // Mark as read (for today's messages only)
    if (this.messages.length > 0 && this.daysBack === 0) {
      this.markMessagesAsRead();
    }
  }

  /**
   * Display only new messages (by redrawing entire screen)
   */
  displayNewMessages() {
    if (this.messages.length > this.lastDisplayedCount) {
      // Redraw entire screen with all messages including new ones
      this.displayMessages();
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead() {
    if (this.messages.length === 0) return;
    
    // Get the latest message timestamp
    const latestMessage = this.messages[this.messages.length - 1];
    
    try {
      await this.client.markAsRead(this.channelId, latestMessage.ts);
    } catch (error) {
      // Silent fail - not critical
    }
  }

  /**
   * Main input loop
   */
  async inputLoop() {
    while (true) {
      try {
        const contextType = this.isThread() ? 'thread' : 'channel';
        const readlineInput = new ReadlineInput([], this.client, contextType);
        const text = await readlineInput.prompt(this.getContextName());

        // Switch to editor mode
        if (text === '__EDITOR__') {
          const editorInput = new EditorInput();
          const editorText = await editorInput.prompt();
          
          if (editorText === '__CANCELLED__') {
            this.displayMessages();
            continue;
          }

          await this.sendAndDisplay(editorText);
          continue;
        }

        // Skip empty input
        if (text === '__EMPTY__') {
          continue;
        }

        // Handle channel switch
        if (typeof text === 'object' && text.type === 'channel') {
          await this.commandHandler.switchToChannel(text.channel);
          return;
        }

        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          continue;
        }

        // Handle /番号 command
        if (trimmedText.match(/^\/\d+$/)) {
          const number = parseInt(trimmedText.substring(1).trim());
          
          // Check if /recent was just shown - use history navigation
          if (this.showingRecentHistory) {
            const history = this.historyManager.getTodayHistory();
            
            if (number > 0 && number <= history.length) {
              const item = history[number - 1];
              console.log(chalk.cyan(`\n📂 ${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''} に移動中...\n`));
              this.cleanup(false);
              
              const session = new ChatSession(item.channelId, item.channelName, item.threadTs);
              await session.start();
              return;
            } else {
              console.log(chalk.yellow(`\n⚠️  履歴番号 ${number} は存在しません`));
              this.showingRecentHistory = false;
              continue;
            }
          }
          
          // Otherwise, in channel context, enter thread
          if (!this.isThread()) {
            await this.commandHandler.enterThread(number.toString());
            return;
          }
          
          // In thread context, invalid command
          console.log(chalk.yellow('\n⚠️  スレッド内では /番号 コマンドは使用できません'));
          continue;
        }
        
        // Reset showingRecentHistory flag on other commands
        this.showingRecentHistory = false;

        // Handle /back command (thread only) - Return to channel
        if (this.isThread() && (trimmedText === '/back' || trimmedText === '/b')) {
          await this.commandHandler.backToChannel();
          return;
        }

        // Handle /rm command
        if (trimmedText.startsWith('/rm ')) {
          const msgNumber = trimmedText.substring(4).trim();
          await this.commandHandler.handleDeleteMessage(msgNumber);
          continue;
        }

        // Handle /history command (channel only)
        if (!this.isThread() && (trimmedText.startsWith('/history') || trimmedText.startsWith('/h'))) {
          const parts = trimmedText.split(' ');
          const limit = parseInt(parts[1]) || 20;
          await this.commandHandler.handleHistory(limit);
          continue;
        }

        // Handle /prev command (channel only) - Go to previous day
        if (!this.isThread() && (trimmedText === '/prev' || trimmedText === '/p')) {
          this.daysBack++;
          await this.fetchMessages();
          this.displayMessages();
          continue;
        }

        // Handle /next command (channel only) - Go to next day
        if (!this.isThread() && (trimmedText === '/next' || trimmedText === '/n')) {
          if (this.daysBack > 0) {
            this.daysBack--;
            await this.fetchMessages();
            this.displayMessages();
          } else {
            console.log(chalk.yellow('\n💡 すでに最新（今日）の履歴を表示しています'));
          }
          continue;
        }

        // Handle /today command (channel only) - Go back to today
        if (!this.isThread() && trimmedText === '/today') {
          this.daysBack = 0;
          await this.fetchMessages();
          this.displayMessages();
          continue;
        }

        // Handle /refresh command - Search and add today's posts to history
        if (trimmedText === '/refresh' || trimmedText === '/sync') {
          await this.commandHandler.refreshTodaysPosts();
          continue;
        }

        // Handle /recent command - Show today's conversation history
        if (trimmedText === '/recent' || trimmedText === '/r') {
          await this.commandHandler.showRecentHistory();
          continue;
        }

        // Handle /help command
        if (trimmedText === '/help') {
          this.showChatHelp();
          continue;
        }

        // Handle /exit command
        if (trimmedText === '/exit' || trimmedText === '/quit' || trimmedText === '/q') {
          this.cleanup();
          return;
        }

        await this.sendAndDisplay(trimmedText);

      } catch (error) {
        if (error.isTtyError || error.message?.includes('User force closed')) {
          this.cleanup();
        } else {
          console.error(chalk.red(`\n❌ エラー: ${error.message}`));
        }
      }
    }
  }

  /**
   * Show chat help
   */
  showChatHelp() {
    console.log(chalk.cyan('\n📖 チャット中のコマンド:'));
    
    if (!this.isThread()) {
      console.log(chalk.yellow('  /<番号>') + chalk.gray('        - 指定した投稿のスレッドに入る（例: /3）'));
      console.log(chalk.yellow('  /prev, /p') + chalk.gray('       - 前日の履歴を表示'));
      console.log(chalk.yellow('  /next, /n') + chalk.gray('       - 次の日の履歴を表示'));
      console.log(chalk.yellow('  /today') + chalk.gray('          - 今日の履歴に戻る'));
      console.log(chalk.yellow('  /history [件数]') + chalk.gray(' - 過去の履歴を表示 (デフォルト: 20件)'));
      console.log(chalk.yellow('  /h [件数]') + chalk.gray('       - 過去の履歴を表示 (短縮形)'));
      console.log(chalk.gray('    💡 デフォルトでは今日のメッセージのみ表示されます'));
    } else {
      console.log(chalk.yellow('  /back, /b') + chalk.gray('       - チャンネルに戻る'));
    }
    
    console.log(chalk.yellow('  /recent, /r') + chalk.gray('      - 今日の会話履歴から選択'));
    console.log(chalk.yellow('  /refresh') + chalk.gray('        - 今日の投稿を検索して履歴に追加'));
    console.log(chalk.yellow('  /rm <番号...>') + chalk.gray('    - メッセージを削除（例: /rm 5 または /rm 1 3 5）'));
    console.log(chalk.yellow('  /exit') + chalk.gray('           - チャット終了'));
    console.log(chalk.yellow('  /help') + chalk.gray('           - このヘルプを表示'));
    console.log(chalk.yellow('  #channel[Tab]') + chalk.gray('   - チャンネル検索・切り替え（例: #gen[Tab] → [Enter]）'));
    console.log(chalk.yellow('  @user[Tab]') + chalk.gray('      - メンション補完（例: @tak[Tab]、@channel等）'));
    console.log(chalk.yellow('  Ctrl+E') + chalk.gray('          - エディタ(vim/nano)を起動'));
    console.log(chalk.yellow('  Ctrl+C') + chalk.gray('          - 終了'));
    console.log();
  }

  /**
   * Update history timestamp for current conversation
   */
  updateHistoryTimestamp() {
    // Prepare thread preview if in thread context
    let threadPreview = null;
    if (this.isThread() && this.messages.length > 0) {
      const firstMsg = this.messages[0];
      const text = firstMsg.text || '';
      const firstLine = text.split('\n')[0].substring(0, 50);
      threadPreview = {
        text: firstLine,
        user: firstMsg.user,
        userName: firstMsg.userName || '',
        ts: firstMsg.ts
      };
    }

    // Update conversation in history
    this.historyManager.addConversation({
      channelId: this.channelId,
      channelName: this.channelName,
      threadTs: this.threadTs,
      type: this.isThread() ? 'thread' : 'channel',
      threadPreview
    });
  }

  /**
   * Send message and update display
   */
  async sendAndDisplay(text) {
    const result = await this.client.sendMessage(this.channelId, text, this.threadTs);

    // Add own message immediately
    this.messages.push({
      ts: result.ts,
      user: this.currentUser.displayName,
      text: text,
      timestamp: new Date()
    });

    // Invalidate cache when sending a message
    if (this.isThread()) {
      this.messageCache.invalidate(this.channelId, this.threadTs);
    }

    // Refresh display
    this.displayMessages();

    // Update history immediately when sending a message
    this.updateHistoryTimestamp();

    // Fetch latest in background
    this.fetchMessages()
      .then(() => {
        if (this.messages.length > this.lastDisplayedCount) {
          this.displayNewMessages();
        }
      })
      .catch(() => {});
  }

  /**
   * Cleanup and exit
   */
  cleanup(exit = true) {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (exit) {
      console.log(chalk.cyan('\n👋 終了しました。'));
      process.exit(0);
    }
  }
}

/**
 * Start a thread chat session
 */
async function threadChat(channelId, threadTs, channelName = null) {
  // Get channel name if not provided
  if (!channelName) {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    const client = new SlackClient(token);
    const channel = await client.getChannelInfo(channelId);
    channelName = channel ? channel.name : channelId;
  }
  
  const session = new ChatSession(channelId, channelName, threadTs);
  await session.start();
}

/**
 * Start a channel chat session with channel selection
 */
async function channelChat() {
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  const client = new SlackClient(token);
  const historyManager = new HistoryManager();

  try {
    console.log(chalk.cyan('📋 チャンネルを選択してください\n'));
    
    // Show today's history if available
    const history = historyManager.getTodayHistory();
    if (history.length > 0) {
      await displayGroupedHistory(history, client, historyManager);
      console.log(chalk.gray('\n💡 ヒント: /数字 で履歴から開く（例: /1）\n'));
    }
    
    // Initial prompt with channel selection (auto-trigger channel mode)
    const readlineInput = new ReadlineInput([], client, 'selection');
    
    console.log(chalk.yellow('💡 ヒント: チャンネル名を入力してTabキーで検索（#は不要）'));
    const result = await readlineInput.prompt('チャンネル選択', true); // true = auto-trigger channel mode
    
    if (result === '__EMPTY__') {
      console.log(chalk.yellow('⚠️  入力がキャンセルされました'));
      return;
    }
    
    // Handle /number command for history selection
    if (typeof result === 'string' && result.startsWith('/')) {
      const command = result.substring(1).trim();
      
      // Handle /delete or /del command
      if (command.startsWith('delete ') || command.startsWith('del ')) {
        const parts = command.split(' ').slice(1); // Remove command name
        const numbers = parts.map(p => parseInt(p)).filter(n => !isNaN(n));
        
        if (numbers.length === 0) {
          console.log(chalk.yellow('\n⚠️  削除する番号を指定してください（例: /delete 1 3 5）'));
        } else {
          // Sort numbers in descending order to delete from bottom to top
          // This prevents index shifting issues
          const sortedNumbers = [...new Set(numbers)].sort((a, b) => b - a);
          const deletedItems = [];
          const invalidNumbers = [];
          
          for (const number of sortedNumbers) {
            if (number > 0 && number <= history.length) {
              const item = history[number - 1];
              const deleted = historyManager.deleteByIndex(number - 1);
              
              if (deleted) {
                deletedItems.push(`${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''}`);
              }
            } else {
              invalidNumbers.push(number);
            }
          }
          
          // Show results
          if (deletedItems.length > 0) {
            console.log(chalk.green(`\n✅ ${deletedItems.length}件の履歴を削除しました:`));
            deletedItems.forEach(name => {
              console.log(chalk.gray(`  - ${name}`));
            });
          }
          
          if (invalidNumbers.length > 0) {
            console.log(chalk.yellow(`\n⚠️  存在しない番号: ${invalidNumbers.join(', ')}`));
          }
        }
        
        // Restart channel selection after delete
        console.log('');
        return await channelChat();
      }
      
      // Handle /number for opening
      const number = parseInt(command);
      
      if (!isNaN(number) && number > 0 && number <= history.length) {
        const item = history[number - 1];
        console.log(chalk.cyan(`\n📂 ${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''} を開いています...\n`));
        
        const session = new ChatSession(item.channelId, item.channelName, item.threadTs);
        await session.start();
        return;
      } else {
        console.log(chalk.yellow(`\n⚠️  履歴番号 ${number} は存在しません`));
        return;
      }
    }
    
    if (typeof result === 'object' && result.type === 'channel') {
      const selectedChannel = result.channel;
      
      // Start chat session
      const session = new ChatSession(selectedChannel.id, selectedChannel.name);
      await session.start();
    } else {
      console.log(chalk.yellow('⚠️  チャンネルが選択されませんでした'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error.message);
    process.exit(1);
  }
}

module.exports = { ChatSession, threadChat, channelChat };
