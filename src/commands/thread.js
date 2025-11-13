/**
 * Unified Chat Session
 * Handles both channel and thread chats seamlessly
 */

const chalk = require('chalk');
const SlackClient = require('../api/slack-client');
const ReadlineInput = require('../ui/readline-input');
const EditorInput = require('../ui/editor-input');
const ThreadDisplay = require('../ui/thread-display');

class ChatSession {
  constructor(channelId, channelName, threadTs = null) {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    this.client = new SlackClient(token);
    this.channelId = channelId;
    this.channelName = channelName;
    this.threadTs = threadTs; // null = channel chat, value = thread chat
    this.channelMembers = [];
    this.currentUser = null;
    this.messages = [];
    this.lastDisplayedCount = 0;
    this.updateInterval = null;
    this.membersLoaded = false;
    this.display = null;
    this.channelsPreloaded = false; // Track if channels are preloaded
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

    // Load members asynchronously (no need to preload channels anymore)
    this.loadMembersAsync();

    // Start update polling
    this.updateInterval = setInterval(() => this.checkUpdates(), 2000);

    // Handle Ctrl+C
    process.removeAllListeners('SIGINT');
    process.on('SIGINT', () => this.cleanup());

    // Start input loop
    await this.inputLoop();
  }

  /**
   * Fetch messages based on context
   */
  async fetchMessages(limit = 100) {
    if (this.isThread()) {
      this.messages = await this.client.getThreadReplies(this.channelId, this.threadTs);
    } else {
      this.messages = await this.client.getChannelHistory(this.channelId, limit);
    }
  }

  /**
   * Load channel members asynchronously
   */
  async loadMembersAsync() {
    try {
      this.channelMembers = await this.client.getChannelMembers(this.channelId);
      this.membersLoaded = true;
      this.displayMessages();
    } catch (error) {
      // Silent fail - mention feature just won't be available
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
      }
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Display all messages
   */
  displayMessages() {
    this.display.displayMessages(
      this.messages,
      this.membersLoaded,
      this.channelMembers.length
    );
    this.lastDisplayedCount = this.messages.length;
  }

  /**
   * Display only new messages
   */
  displayNewMessages() {
    if (this.messages.length > this.lastDisplayedCount) {
      const newMessages = this.messages.slice(this.lastDisplayedCount);
      this.display.displayNewMessages(newMessages);
      this.lastDisplayedCount = this.messages.length;
    }
  }

  /**
   * Main input loop
   */
  async inputLoop() {
    while (true) {
      try {
        const readlineInput = new ReadlineInput(this.channelMembers, this.client);
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

        // Handle /番号 command (enter thread) - only in channel context
        if (!this.isThread() && trimmedText.match(/^\/\d+$/)) {
          const msgNumber = trimmedText.substring(1).trim();
          await this.enterThread(msgNumber);
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
   * Handle message deletion
   */
  async handleDeleteMessage(msgNumber) {
    const num = parseInt(msgNumber, 10);
    
    if (isNaN(num) || num < 1 || num > this.messages.length) {
      console.log(chalk.red(`\n❌ 無効なメッセージ番号: ${msgNumber}`));
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.messages.length}`));
      return;
    }

    const message = this.messages[num - 1];
    
    try {
      await this.client.deleteMessage(this.channelId, message.ts);
      console.log(chalk.green(`\n✅ メッセージ [${num}] を削除しました`));
      
      // Refresh messages
      await this.fetchMessages();
      this.displayMessages();
    } catch (error) {
      console.error(chalk.red(`\n❌ 削除失敗: ${error.message}`));
      console.log(chalk.yellow('💡 ヒント: 自分のメッセージか、適切な権限が必要です'));
    }
  }

  /**
   * Handle history command
   */
  async handleHistory(limit) {
    console.log(chalk.cyan(`\n📜 直近${limit}件の履歴を取得中...\n`));
    await this.fetchMessages(limit);
    this.displayMessages();
  }

  /**
   * Show chat help
   */
  showChatHelp() {
    console.log(chalk.cyan('\n📖 チャット中のコマンド:'));
    
    if (!this.isThread()) {
      console.log(chalk.yellow('  /<番号>') + chalk.gray('        - 指定した投稿のスレッドに入る（例: /3）'));
      console.log(chalk.yellow('  /history [件数]') + chalk.gray(' - 履歴を表示 (デフォルト: 20件)'));
      console.log(chalk.yellow('  /h [件数]') + chalk.gray('       - 履歴を表示 (短縮形)'));
    }
    
    console.log(chalk.yellow('  /rm <番号>') + chalk.gray('      - 指定したメッセージを削除（例: /rm 5）'));
    console.log(chalk.yellow('  /exit') + chalk.gray('           - チャット終了'));
    console.log(chalk.yellow('  /help') + chalk.gray('           - このヘルプを表示'));
    console.log(chalk.yellow('  #channel') + chalk.gray('        - チャンネル切り替え'));
    console.log(chalk.yellow('  @user') + chalk.gray('           - メンション補完'));
    console.log(chalk.yellow('  Ctrl+J') + chalk.gray('          - 改行を挿入（複数行メッセージ）'));
    console.log(chalk.yellow('  Ctrl+E') + chalk.gray('          - エディタ(vim/nano)を起動'));
    console.log(chalk.yellow('  Ctrl+C') + chalk.gray('          - 終了'));
    console.log();
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

    // Refresh display
    this.displayMessages();

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

  try {
    console.log(chalk.cyan('📋 チャンネルを選択してください\n'));
    
    // Initial prompt with channel selection (auto-trigger channel mode)
    const readlineInput = new ReadlineInput([], client);
    
    console.log(chalk.yellow('💡 ヒント: チャンネル名を入力してTabキーで検索（#は不要）'));
    const result = await readlineInput.prompt('チャンネル選択', true); // true = auto-trigger channel mode
    
    if (result === '__EMPTY__') {
      console.log(chalk.yellow('⚠️  入力がキャンセルされました'));
      return;
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
