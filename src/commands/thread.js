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
const { DISPLAY, API, FULLWIDTH_NUMBER_OFFSET } = require('../utils/constants');

/**
 * Convert full-width numbers to half-width numbers
 */
function toHalfWidth(str) {
  return str.replace(/[０-９]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - FULLWIDTH_NUMBER_OFFSET);
  });
}

class ChatSession {
  constructor(channelId, channelName, threadTs = null) {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    this.client = new SlackClient(token);
    this.channelId = channelId;
    this.channelName = channelName;
    this.threadTs = threadTs; // null = channel chat, value = thread chat
    this.currentUser = null;
    this.messages = [];
    this.allMessages = []; // Store all messages for threads
    this.displayCount = DISPLAY.INITIAL_MESSAGE_COUNT; // Number of messages to display
    this.lastDisplayedCount = 0;
    this.updateInterval = null;
    this.display = null;
    this.currentDate = null; // Track current viewing date (for channels only)
    this.daysBack = 0; // 0 = today, 1 = yesterday, etc.
    this.historyManager = new HistoryManager();
    this.messageCache = new MessageCache();
    this.showingRecentHistory = false; // Track if /recent was just shown
    this.recentHistory = null; // Store merged history for navigation
    this.commandHandler = new CommandHandler(this); // Command handler
  }

  /**
   * Check if this is a thread context
   */
  isThread() {
    return this.threadTs !== null;
  }

  /**
   * Get context display name for prompt
   */
  getPromptName() {
    // If showing recent history, use "チャンネル選択" instead of channel name
    if (this.showingRecentHistory) {
      return 'チャンネル選択';
    }
    return this.getContextName();
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
    this.lastDisplayedCount = this.isThread() ? this.allMessages.length : this.messages.length;

    // Display messages
    this.displayMessages();

    // Prepare thread preview for caching
    let threadPreview = null;
    if (this.isThread() && this.allMessages.length > 0) {
      const firstMsg = this.allMessages[0];
      const text = firstMsg.text || '';
      threadPreview = {
        text: text,  // Store full text, not just first line
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
    if (process.env.DEBUG_POLL) {
      console.error('[DEBUG] ポーリング開始: 10秒間隔でcheckUpdates()を実行');
    }
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
  async fetchMessages(limit = null, daysBack = null, skipCache = false) {
    if (this.isThread()) {
      // Try to get from cache first (unless skipCache is true)
      if (!skipCache) {
        const cached = this.messageCache.get(this.channelId, this.threadTs);
        if (cached) {
          this.allMessages = cached;
          // Display only the latest displayCount messages
          this.messages = this.allMessages.slice(-this.displayCount);
          return;
        }
      }
      
      // For threads, get all replies (no date filtering)
      this.allMessages = await this.client.getThreadReplies(this.channelId, this.threadTs);
      
      // Display only the latest displayCount messages
      this.messages = this.allMessages.slice(-this.displayCount);
      
      // Save to cache
      this.messageCache.set(this.channelId, this.allMessages, this.threadTs);
    } else {
      // For channels, don't cache (messages change frequently by date)
      // Use daysBack parameter or instance variable
      const days = daysBack !== null ? daysBack : this.daysBack;
      
      // Calculate oldest timestamp based on days back
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - days);
      targetDate.setHours(0, 0, 0, 0);
      const oldest = targetDate.getTime() / 1000;
      
      // Calculate newest timestamp
      // When polling (skipCache=true) and viewing today (days=0), use current time
      // Otherwise, use end of that day
      let newest;
      if (skipCache && days === 0) {
        // For real-time polling of today's messages, use current time
        newest = Date.now() / 1000;
      } else {
        // For historical view or initial load, use end of day
        const newestDate = new Date(targetDate);
        newestDate.setHours(23, 59, 59, 999);
        newest = newestDate.getTime() / 1000;
      }
      
      this.currentDate = targetDate;
      this.messages = await this.client.getChannelHistoryRange(this.channelId, oldest, newest, limit);
    }
  }

  /**
   * Check for new messages
   */
  async checkUpdates() {
    try {
      if (process.env.DEBUG_POLL) {
        console.error(`[DEBUG] checkUpdates() 実行開始 - messages.length=${this.messages.length}`);
      }
      
      // For threads, compare allMessages; for channels, compare messages
      const oldCount = this.isThread() ? this.allMessages.length : this.messages.length;
      
      // Skip cache to get fresh data during polling
      await this.fetchMessages(null, null, true);

      if (process.env.DEBUG_POLL) {
        const newCount = this.isThread() ? this.allMessages.length : this.messages.length;
        console.error(`[DEBUG] checkUpdates() - newCount=${newCount}, oldCount=${oldCount}`);
      }

      const newCount = this.isThread() ? this.allMessages.length : this.messages.length;
      
      if (newCount > oldCount) {
        if (process.env.DEBUG_POLL) {
          console.error(`[DEBUG] 新しいメッセージを検出: ${newCount - oldCount}件`);
        }
        this.displayNewMessages();
        // Update history timestamp when new messages arrive
        this.updateHistoryTimestamp();
      }
    } catch (error) {
      if (process.env.DEBUG_POLL) {
        console.error(`[DEBUG] checkUpdates() エラー:`, error.message);
      }
      // Silent fail
    }
  }

  /**
   * Stop polling for updates
   */
  stopPolling() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      if (process.env.DEBUG_POLL) {
        console.error('[DEBUG] ポーリング停止');
      }
    }
  }

  /**
   * Start polling for updates
   */
  startPolling() {
    // Only start if not already running
    if (!this.updateInterval) {
      this.updateInterval = setInterval(() => this.checkUpdates(), 10000);
      if (process.env.DEBUG_POLL) {
        console.error('[DEBUG] ポーリング開始');
      }
    }
  }

  /**
   * Display all messages
   */
  displayMessages() {
    // Show current viewing date for channels
    if (!this.isThread()) {
      // Ensure currentDate is set
      if (!this.currentDate) {
        this.currentDate = new Date();
        this.currentDate.setDate(this.currentDate.getDate() - this.daysBack);
        this.currentDate.setHours(0, 0, 0, 0);
      }
      
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
      
      this.display.displayMessages(this.messages);
    } else {
      // For threads, show if there are more messages available
      if (this.allMessages.length > this.messages.length) {
        const hiddenCount = this.allMessages.length - this.messages.length;
        console.log(chalk.yellow(`\n💡 過去のメッセージが ${hiddenCount} 件あります。/more で表示できます。\n`));
      }
      
      // Calculate start index for numbering (how many messages are hidden)
      const startIndex = this.allMessages.length - this.messages.length;
      this.display.displayMessages(this.messages, startIndex);
    }
    
    this.lastDisplayedCount = this.isThread() ? this.allMessages.length : this.messages.length;
    
    // Mark as read (for today's messages only)
    if (this.messages.length > 0 && this.daysBack === 0) {
      this.markMessagesAsRead();
    }
  }

  /**
   * Display only new messages (by redrawing entire screen)
   */
  displayNewMessages() {
    // For threads, compare allMessages; for channels, compare messages
    const currentCount = this.isThread() ? this.allMessages.length : this.messages.length;
    
    if (currentCount > this.lastDisplayedCount) {
      // Redraw entire screen with all messages including new ones
      this.displayMessages();
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead() {
    // Skip marking as read for threads - it's handled by the parent message
    if (this.isThread()) {
      if (process.env.DEBUG_PERF) {
        console.error('[DEBUG] markAsRead: スレッドなのでスキップ');
      }
      return;
    }
    
    if (this.messages.length === 0) {
      if (process.env.DEBUG_PERF) {
        console.error('[DEBUG] markAsRead: メッセージが0件');
      }
      return;
    }
    
    // Get the latest message timestamp
    const latestMessage = this.messages[this.messages.length - 1];
    
    if (process.env.DEBUG_PERF) {
      console.error(`[DEBUG] markAsRead: チャンネル, messages.length=${this.messages.length}`);
    }
    
    // Validate that we have a valid timestamp
    if (!latestMessage || !latestMessage.ts) {
      if (process.env.DEBUG_PERF) {
        console.error('[DEBUG] markAsRead: latestMessage.tsがありません');
      }
      return;
    }
    
    try {
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] markAsRead: tsToMark=${latestMessage.ts}`);
      }
      
      await this.client.markAsRead(this.channelId, latestMessage.ts);
      
      if (process.env.DEBUG_PERF) {
        console.error('[DEBUG] markAsRead: 成功');
      }
    } catch (error) {
      // Silent fail - not critical
      if (process.env.DEBUG_PERF) {
        console.error(`[DEBUG] markAsRead失敗: ${error.message}`);
      }
    }
  }

  /**
   * Main input loop
   */
  async inputLoop() {
    while (true) {
      try {
        const contextType = this.isThread() ? 'thread' : 'channel';
        const readlineInput = new ReadlineInput([], this.client, contextType, this.channelId);
        const text = await readlineInput.prompt(this.getPromptName());

        // Switch to editor mode
        if (text === '__EDITOR__') {
          // Stop polling while in editor mode
          this.stopPolling();
          
          const editorInput = new EditorInput();
          const editorText = await editorInput.prompt();
          
          // Resume polling after exiting editor
          this.startPolling();
          
          // Immediately check for updates after exiting editor
          await this.checkUpdates();
          
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

        // Convert full-width numbers to half-width
        const halfWidthText = toHalfWidth(trimmedText);

        // Handle numbers in /recent mode (without / prefix)
        if (this.showingRecentHistory && halfWidthText.match(/^\d+$/)) {
          const number = parseInt(halfWidthText);
          const history = this.recentHistory || this.historyManager.getTodayHistory();
          
          if (number > 0 && number <= history.length) {
            const item = history[number - 1];
            console.log(chalk.cyan(`\n📂 ${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''} に移動中...\n`));
            this.cleanup(false);
            
            const session = new ChatSession(item.channelId, item.channelName, item.threadTs);
            await session.start();
            return;
          } else {
            console.log(chalk.yellow(`\n⚠️  履歴番号 ${number} は存在しません (1-${history.length})`));
            this.showingRecentHistory = false;
            this.recentHistory = null;
            continue;
          }
        }

        // Handle /番号 command
        if (halfWidthText.match(/^\/\d+$/)) {
          const number = parseInt(halfWidthText.substring(1).trim());
          
          // Check if /recent was just shown - use history navigation
          if (this.showingRecentHistory) {
            const history = this.recentHistory || this.historyManager.getTodayHistory();
            
            if (number > 0 && number <= history.length) {
              const item = history[number - 1];
              console.log(chalk.cyan(`\n📂 ${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''} に移動中...\n`));
              this.cleanup(false);
              
              const session = new ChatSession(item.channelId, item.channelName, item.threadTs);
              await session.start();
              return;
            } else {
              console.log(chalk.yellow(`\n⚠️  履歴番号 ${number} は存在しません (1-${history.length})`));
              this.showingRecentHistory = false;
              this.recentHistory = null;
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
        
        // Handle /cancel command - Exit recent history mode
        if (halfWidthText === '/cancel' || halfWidthText === '/c') {
          if (this.showingRecentHistory) {
            this.showingRecentHistory = false;
            this.recentHistory = null;
            console.log(chalk.green('\n✅ 履歴選択モードを解除しました\n'));
            console.log(chalk.cyan('🔄 メッセージを再取得中...\n'));
            await this.fetchMessages(null, null, true); // skipCache = true
            this.displayMessages();
            // Restart polling
            this.startPolling();
            continue;
          }
          // If not in recent history mode, just continue (don't do anything)
          continue;
        }

        // Handle /back command (thread only) - Return to channel
        if (this.isThread() && (halfWidthText === '/back' || halfWidthText === '/b')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          await this.commandHandler.backToChannel();
          return;
        }

        // Handle /rm command
        if (halfWidthText.startsWith('/rm ')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          const msgNumber = halfWidthText.substring(4).trim();
          await this.commandHandler.handleDeleteMessage(msgNumber);
          continue;
        }

        // Handle /history command (channel only)
        if (!this.isThread() && (halfWidthText.startsWith('/history') || halfWidthText.startsWith('/h'))) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          const parts = halfWidthText.split(' ');
          const limit = parseInt(parts[1]) || API.SEARCH_RESULT_LIMIT;
          await this.commandHandler.handleHistory(limit);
          continue;
        }

        // Handle /prev command (channel only) - Go to previous day
        if (!this.isThread() && (halfWidthText === '/prev' || halfWidthText === '/p')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          this.daysBack++;
          await this.fetchMessages();
          this.displayMessages();
          continue;
        }

        // Handle /next command (channel only) - Go to next day
        if (!this.isThread() && (halfWidthText === '/next' || halfWidthText === '/n')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
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
        if (!this.isThread() && halfWidthText === '/today') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          this.daysBack = 0;
          await this.fetchMessages();
          this.displayMessages();
          continue;
        }

        // Handle /refresh command - Search and add today's posts to history
        if (halfWidthText === '/refresh' || halfWidthText === '/sync') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          await this.commandHandler.refreshTodaysPosts();
          continue;
        }

        // Handle /clear command - Clear history cache
        if (halfWidthText === '/clear') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          this.historyManager.clearHistory();
          console.log(chalk.green('\n✅ 履歴キャッシュをクリアしました\n'));
          continue;
        }

        // Handle /w or /web command - Open in browser
        if (halfWidthText === '/w' || halfWidthText === '/web') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          await this.commandHandler.openInBrowser();
          continue;
        }

        // Handle /link command - Display message link
        if (halfWidthText.startsWith('/link')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          const parts = halfWidthText.split(/\s+/);
          const msgNumber = parts[1]; // Optional message number
          await this.commandHandler.showMessageLink(msgNumber);
          continue;
        }

        // Handle /reload command - Reload thread messages (skip cache)
        if (halfWidthText === '/reload' || halfWidthText === '/rl') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          console.log(chalk.cyan('\n🔄 メッセージを再取得中...\n'));
          await this.fetchMessages(null, null, true); // skipCache = true
          this.displayMessages();
          continue;
        }

        // Handle /more command (thread only) - Load more messages from history
        if (this.isThread() && (halfWidthText === '/more' || halfWidthText === '/m')) {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          if (this.allMessages.length > this.messages.length) {
            // Increase display count
            this.displayCount += DISPLAY.MESSAGE_INCREMENT;
            // Update messages to show more
            this.messages = this.allMessages.slice(-this.displayCount);
            this.displayMessages();
          } else {
            console.log(chalk.yellow('\n💡 これ以上過去のメッセージはありません\n'));
          }
          continue;
        }

        // Handle /recent command - Show today's conversation history (toggle behavior)
        if (halfWidthText === '/recent' || halfWidthText === '/r') {
          // If already in recent history mode, cancel it (toggle behavior)
          if (this.showingRecentHistory) {
            this.showingRecentHistory = false;
            this.recentHistory = null;
            console.log(chalk.green('\n✅ 履歴選択モードを解除しました\n'));
            console.log(chalk.cyan('🔄 メッセージを再取得中...\n'));
            await this.fetchMessages(null, null, true); // skipCache = true
            this.displayMessages();
            // Restart polling
            this.startPolling();
          } else {
            // Show recent history and stop polling
            this.stopPolling();
            await this.commandHandler.showRecentHistory();
          }
          continue;
        }

        // Handle /help command
        if (halfWidthText === '/help') {
          // Reset recent history mode
          this.showingRecentHistory = false;
          this.recentHistory = null;
          this.showChatHelp();
          continue;
        }

        // Handle /exit command
        if (halfWidthText === '/exit' || halfWidthText === '/quit' || halfWidthText === '/q') {
          this.cleanup();
          return;
        }

        // If in recent history mode and input is not a command, don't send as message
        if (this.showingRecentHistory) {
          console.log(chalk.yellow('\n⚠️  履歴選択モード中です。番号を入力するか、コマンドを実行してください\n'));
          console.log(chalk.gray('💡 ヒント: 数字 または /数字 で移動（例: 1 または /1）'));
          console.log(chalk.gray('💡 /cancel または /c で履歴選択モードを解除できます\n'));
          console.log(chalk.gray('💡 通常モードに戻るには別のコマンドを実行してください\n'));
          this.showingRecentHistory = false;
          this.recentHistory = null;
          continue;
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
      console.log(chalk.yellow('  /more, /m') + chalk.gray('       - さらに30件の過去メッセージを表示'));
    }
    
    console.log(chalk.yellow('  /recent, /r') + chalk.gray('      - 今日の会話履歴から選択'));
    console.log(chalk.yellow('  /cancel, /c') + chalk.gray('     - 履歴選択モードを解除'));
    console.log(chalk.yellow('  /refresh') + chalk.gray('        - 今日の投稿を検索して履歴に追加'));
    console.log(chalk.yellow('  /reload, /rl') + chalk.gray('    - メッセージを再取得（最新の状態に更新）'));
    console.log(chalk.yellow('  /clear') + chalk.gray('          - 履歴キャッシュをクリア'));
    console.log(chalk.yellow('  /w, /web') + chalk.gray('        - ブラウザで開く'));
    console.log(chalk.yellow('  /link [番号]') + chalk.gray('    - メッセージリンクを表示（例: /link 5）'));
    console.log(chalk.yellow('  /rm <番号...>') + chalk.gray('    - メッセージを削除（例: /rm 5 または /rm 1 3 5）'));
    console.log(chalk.yellow('  /exit') + chalk.gray('           - チャット終了'));
    console.log(chalk.yellow('  /help') + chalk.gray('           - このヘルプを表示'));
    console.log(chalk.yellow('  #channel[Tab]') + chalk.gray('   - チャンネル検索・切り替え（例: #gen[Tab] → [Enter]）'));
    console.log(chalk.yellow('  @user[Tab]') + chalk.gray('      - メンション補完（例: @tak[Tab]、@channel等）'));
    console.log(chalk.yellow('  Ctrl+R') + chalk.gray('          - 今日の会話履歴から選択'));
    console.log(chalk.yellow('  Ctrl+W') + chalk.gray('          - ブラウザで開く'));
    console.log(chalk.yellow('  Ctrl+L') + chalk.gray('          - メッセージリンクをコピー'));
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
    if (this.isThread() && this.allMessages.length > 0) {
      const firstMsg = this.allMessages[0];
      const text = firstMsg.text || '';
      const firstLine = text.split('\n')[0].substring(0, DISPLAY.TEXT_PREVIEW_LENGTH);
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

    // Invalidate cache when sending a message
    if (this.isThread()) {
      this.messageCache.invalidate(this.channelId, this.threadTs);
      // Maintain current display count when refreshing
      const currentDisplayCount = this.displayCount;
      await this.fetchMessages(null, null, true);
      this.displayCount = currentDisplayCount;
      // Make sure the new message is visible
      if (this.allMessages.length > this.messages.length) {
        this.messages = this.allMessages.slice(-this.displayCount);
      }
    } else {
      await this.fetchMessages(null, null, true);
    }

    // Refresh display
    this.displayMessages();

    // Update history immediately when sending a message
    this.updateHistoryTimestamp();
  }

  /**
   * Cleanup and exit
   */
  cleanup(exit = true) {
    this.stopPolling();
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
    
    // Get today's history
    const history = historyManager.getTodayHistory();
    
    // Get recent :eyes: reactions
    const reactions = await client.getReactions(API.REACTION_FETCH_LIMIT, 'eyes');
    
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
          reactions: item.reactions,
          messageTs: item.messageTs,  // ✅ リアクション削除に必要
          isReactionItem: true  // ✅ リアクションアイテムであることを識別
        });
      }
    }
    
    // Show merged history if available
    if (mergedHistory.length > 0) {
      await displayGroupedHistory(mergedHistory, client, historyManager);
      console.log(chalk.gray('\n💡 ヒント: /数字 で履歴から開く（例: /1）\n'));
    }
    
    // Initial prompt with channel selection (auto-trigger channel mode)
    const readlineInput = new ReadlineInput([], client, 'selection');
    
    console.log(chalk.yellow('💡 ヒント: 数字で履歴選択、#でチャンネル検索（例: 1 または #general）'));
    const result = await readlineInput.prompt('チャンネル選択');
    
    if (result === '__EMPTY__') {
      console.log(chalk.yellow('⚠️  入力がキャンセルされました'));
      return;
    }
    
    // Handle number-only input for history selection (without /)
    if (typeof result === 'string') {
      const trimmed = result.trim();
      const halfWidthTrimmed = toHalfWidth(trimmed);
      const number = parseInt(halfWidthTrimmed);
      
      // If input is a pure number (not starting with /), treat as history selection
      if (!isNaN(number) && halfWidthTrimmed === number.toString() && number > 0) {
        if (number <= mergedHistory.length) {
          const item = mergedHistory[number - 1];
          console.log(chalk.cyan(`\n📂 ${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''} を開いています...\n`));
          
          const session = new ChatSession(item.channelId, item.channelName, item.threadTs);
          await session.start();
          return;
        } else {
          console.log(chalk.yellow(`\n⚠️  履歴番号 ${number} は存在しません`));
          return;
        }
      }
    }
    
    // Handle /number command for history selection (with /)
    if (typeof result === 'string' && result.startsWith('/')) {
      const command = result.substring(1).trim();
      const halfWidthCommand = toHalfWidth(command);
      
      // Handle /clear command
      if (halfWidthCommand === 'clear') {
        historyManager.clearHistory();
        console.log(chalk.green('\n✅ 履歴キャッシュをクリアしました\n'));
        return await channelChat();
      }
      
      // Handle /delete or /del command
      if (halfWidthCommand.startsWith('delete ') || halfWidthCommand.startsWith('del ')) {
        const parts = halfWidthCommand.split(' ').slice(1); // Remove command name
        const numbers = parts.map(p => parseInt(p)).filter(n => !isNaN(n));
        
        if (numbers.length === 0) {
          console.log(chalk.yellow('\n⚠️  削除する番号を指定してください（例: /delete 1 3 5）'));
        } else {
          // Sort numbers in descending order to delete from bottom to top
          // This prevents index shifting issues
          const sortedNumbers = [...new Set(numbers)].sort((a, b) => b - a);
          const deletedItems = [];
          const removedReactions = [];
          const invalidNumbers = [];
          const errors = [];
          
          for (const number of sortedNumbers) {
            if (number > 0 && number <= mergedHistory.length) {
              const item = mergedHistory[number - 1];
              
              // Check if this is a reaction item
              if (item.isReactionItem && item.reactions && item.reactions.includes('eyes')) {
                // Remove :eyes: reaction
                try {
                  await client.removeReaction(item.channelId, item.messageTs, 'eyes');
                  removedReactions.push(`${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''}`);
                } catch (error) {
                  errors.push(`${item.channelName}: ${error.message}`);
                }
              } else {
                // Delete from history
                const deleted = historyManager.deleteByIndex(number - 1);
                
                if (deleted) {
                  deletedItems.push(`${item.channelName}${item.type === 'thread' ? '[スレッド]' : ''}`);
                }
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
          
          if (removedReactions.length > 0) {
            console.log(chalk.green(`\n✅ ${removedReactions.length}件のリアクションを削除しました:`));
            removedReactions.forEach(name => {
              console.log(chalk.gray(`  - ${name}`));
            });
          }
          
          if (errors.length > 0) {
            console.log(chalk.red(`\n❌ エラーが発生しました:`));
            errors.forEach(err => {
              console.log(chalk.gray(`  - ${err}`));
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
      const number = parseInt(halfWidthCommand);
      
      if (!isNaN(number) && number > 0 && number <= mergedHistory.length) {
        const item = mergedHistory[number - 1];
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
