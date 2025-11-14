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
          await this.switchToChannel(text.channel);
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
            await this.enterThread(number.toString());
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
          await this.backToChannel();
          return;
        }

        // Handle /rm command
        if (trimmedText.startsWith('/rm ')) {
          const msgNumber = trimmedText.substring(4).trim();
          await this.handleDeleteMessage(msgNumber);
          continue;
        }

        // Handle /history command (channel only)
        if (!this.isThread() && (trimmedText.startsWith('/history') || trimmedText.startsWith('/h'))) {
          const parts = trimmedText.split(' ');
          const limit = parseInt(parts[1]) || 20;
          await this.handleHistory(limit);
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
          await this.refreshTodaysPosts();
          continue;
        }

        // Handle /recent command - Show today's conversation history
        if (trimmedText === '/recent' || trimmedText === '/r') {
          await this.showRecentHistory();
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
   * Switch to another channel
   */
  async switchToChannel(channel) {
    this.cleanup(false);
    
    console.log(chalk.cyan(`\n📬 #${channel.name} に切り替えます...\n`));
    
    const newSession = new ChatSession(channel.id, channel.name);
    await newSession.start();
  }

  /**
   * Enter a thread from channel
   */
  async enterThread(msgNumber) {
    const num = parseInt(msgNumber, 10);
    
    if (isNaN(num) || num < 1 || num > this.messages.length) {
      console.log(chalk.red(`\n❌ 無効なメッセージ番号: ${msgNumber}`));
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.messages.length}`));
      return;
    }

    const message = this.messages[num - 1];
    
    this.cleanup(false);
    
    console.log(chalk.cyan(`\n🧵 スレッドに入ります...\n`));
    
    const threadSession = new ChatSession(this.channelId, this.channelName, message.ts);
    await threadSession.start();
  }

  /**
   * Return to channel from thread
   */
  async backToChannel() {
    this.cleanup(false);
    
    console.log(chalk.cyan(`\n⬅️  チャンネルに戻ります...\n`));
    
    const channelSession = new ChatSession(this.channelId, this.channelName);
    await channelSession.start();
  }

  /**
   * Handle message deletion
   */
  /**
   * Handle delete message command (supports multiple message numbers)
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
      if (num < 1 || num > this.messages.length) {
        invalidNumbers.push(num);
        continue;
      }
      
      const message = this.messages[num - 1];
      
      try {
        await this.client.deleteMessage(this.channelId, message.ts);
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
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.messages.length}`));
    }
    
    if (failedDeletes.length > 0) {
      console.log(chalk.red(`\n❌ 削除失敗: ${failedDeletes.map(f => f.num).join(', ')}`));
      console.log(chalk.yellow('💡 ヒント: 自分のメッセージか、適切な権限が必要です'));
    }
    
    // Refresh messages if any were deleted
    if (deletedMessages.length > 0) {
      await this.fetchMessages();
      this.displayMessages();
    }
  }

  /**
   * Handle history command
   */
  async handleHistory(limit) {
    console.log(chalk.cyan(`\n📜 直近${limit}件の履歴を取得中...\n`));
    // When using /history command with limit, fetch from beginning (oldest = 0)
    this.messages = await this.client.getChannelHistory(this.channelId, limit, 0);
    this.displayMessages();
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
   * Refresh today's posts - Search and add to history
   */
  async refreshTodaysPosts() {
    console.log(chalk.cyan('\n🔍 今日の投稿を検索中...\n'));
    
    const userConversations = await this.client.searchUserMessagesToday();
    
    if (userConversations.length === 0) {
      console.log(chalk.yellow('💡 今日の新しい投稿は見つかりませんでした'));
      return;
    }
    
    console.log(chalk.green(`✅ ${userConversations.length}件の会話を見つけました\n`));
    
    // Add found conversations to history
    for (const conv of userConversations) {
      let threadPreview = null;
      
      if (conv.type === 'thread') {
        // Create thread preview from search result
        const firstLine = conv.text.split('\n')[0].substring(0, 50);
        threadPreview = {
          text: firstLine,
          user: '',
          userName: '',
          ts: conv.threadTs
        };
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
   * Show recent conversation history and let user select
   */
  async showRecentHistory() {
    const history = this.historyManager.getTodayHistory();
    
    if (history.length === 0) {
      console.log(chalk.yellow('\n💡 今日の履歴はまだありません'));
      return;
    }

    // Separate threads and channels
    const threads = history.filter(item => item.type === 'thread');
    const channels = history.filter(item => item.type === 'channel');
    
    let globalIndex = 0;
    
    // Display threads first
    if (threads.length > 0) {
      console.log(chalk.cyan('\n💬 スレッド:\n'));
      
      for (let i = 0; i < threads.length; i++) {
        const item = threads[i];
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
          
          console.log(
            chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
            chalk.gray(time) + ' ' +
            chalk.green(item.channelName) + chalk.gray('[スレッド]')
          );
          console.log(
            '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + previewText
          );
        } else {
          // Fallback to API call if no cache, then cache the result
          try {
            // Get the first message of the thread
            const replies = await this.client.getThreadReplies(item.channelId, item.threadTs);
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
              this.historyManager.addConversation({
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
                chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
                chalk.gray(time) + ' ' +
                chalk.green(item.channelName) + chalk.gray('[スレッド]')
              );
              console.log(
                '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + previewText
              );
            }
          } catch (error) {
            // Fallback if we can't get thread details
            console.log(
              chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
              chalk.gray(time) + ' ' +
              chalk.green(item.channelName) + chalk.gray('[スレッド]')
            );
          }
        }
        globalIndex++;
      }
    }
    
    // Display channels
    if (channels.length > 0) {
      if (threads.length > 0) {
        console.log(''); // Add blank line between sections
      }
      console.log(chalk.cyan('# チャンネル:\n'));
      
      for (let i = 0; i < channels.length; i++) {
        const item = channels[i];
        const time = new Date(item.timestamp).toLocaleTimeString('ja-JP', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        console.log(
          chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
          chalk.gray(time) + ' ' +
          chalk.green(item.channelName)
        );
        globalIndex++;
      }
    }
    
    console.log(chalk.gray('\n💡 ヒント: /数字 で移動（例: /1）\n'));
    this.showingRecentHistory = true; // Set flag for next command
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
      // Separate threads and channels
      const threads = history.filter(item => item.type === 'thread');
      const channels = history.filter(item => item.type === 'channel');
      
      let globalIndex = 0;
      
      // Display threads first
      if (threads.length > 0) {
        console.log(chalk.cyan('💬 スレッド:\n'));
        
        for (let i = 0; i < threads.length; i++) {
          const item = threads[i];
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
            
            console.log(
              chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
              chalk.gray(time) + ' ' +
              chalk.green(item.channelName) + chalk.gray('[スレッド]')
            );
            console.log(
              '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + previewText
            );
          } else {
            // Fallback to API call if no cache, then cache the result
            try {
              // Get the first message of the thread
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
                  chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
                  chalk.gray(time) + ' ' +
                  chalk.green(item.channelName) + chalk.gray('[スレッド]')
                );
                console.log(
                  '    ' + chalk.gray(`└─ ${msgTime}:`) + ' ' + previewText
                );
              }
            } catch (error) {
              // Fallback if we can't get thread details
              console.log(
                chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
                chalk.gray(time) + ' ' +
                chalk.green(item.channelName) + chalk.gray('[スレッド]')
              );
            }
          }
          globalIndex++;
        }
      }
      
      // Display channels
      if (channels.length > 0) {
        if (threads.length > 0) {
          console.log(''); // Add blank line between sections
        }
        console.log(chalk.cyan('# チャンネル:\n'));
        
        for (let i = 0; i < channels.length; i++) {
          const item = channels[i];
          const time = new Date(item.timestamp).toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          
          console.log(
            chalk.yellow(`[${globalIndex + 1}]`) + ' ' +
            chalk.gray(time) + ' ' +
            chalk.green(item.channelName)
          );
          globalIndex++;
        }
      }
      
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
