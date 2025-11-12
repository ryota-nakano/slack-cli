/**
 * Thread Command
 * Interactive thread chat with real-time updates
 */

const chalk = require('chalk');
const SlackClient = require('../api/slack-client');
const ReadlineInput = require('../ui/readline-input');
const EditorInput = require('../ui/editor-input');
const ThreadDisplay = require('../ui/thread-display');

class ThreadChatSession {
  constructor(channelId, threadTs) {
    const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
    this.client = new SlackClient(token);
    this.channelId = channelId;
    this.threadTs = threadTs;
    this.channelName = null;
    this.channelMembers = [];
    this.currentUser = null;
    this.replies = [];
    this.lastDisplayedCount = 0;
    this.updateInterval = null;
    this.membersLoaded = false;
    this.display = null;
  }

  /**
   * Initialize and start chat session
   */
  async start() {
    console.log(chalk.cyan('🔄 スレッド情報を取得中...\n'));

    // Get channel info
    const channel = await this.client.getChannelInfo(this.channelId);
    this.channelName = channel ? channel.name : this.channelId;
    this.display = new ThreadDisplay(this.channelName);

    // Get current user
    this.currentUser = await this.client.getCurrentUser();

    // Get initial thread replies
    this.replies = await this.client.getThreadReplies(this.channelId, this.threadTs);
    this.lastDisplayedCount = this.replies.length;

    // Display messages
    this.displayMessages();

    // Load members asynchronously
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
      const oldCount = this.replies.length;
      const newReplies = await this.client.getThreadReplies(this.channelId, this.threadTs);

      if (newReplies.length > oldCount) {
        this.replies = newReplies;
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
      this.replies,
      this.membersLoaded,
      this.channelMembers.length
    );
    this.lastDisplayedCount = this.replies.length;
  }

  /**
   * Display only new messages
   */
  displayNewMessages() {
    if (this.replies.length > this.lastDisplayedCount) {
      const newReplies = this.replies.slice(this.lastDisplayedCount);
      this.display.displayNewMessages(newReplies);
      this.lastDisplayedCount = this.replies.length;
    }
  }

  /**
   * Main input loop
   */
  async inputLoop() {
    while (true) {
      try {
        const readlineInput = new ReadlineInput(this.channelMembers);
        const text = await readlineInput.prompt(this.channelName);

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

        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          continue;
        }

        // Handle /rm command
        if (trimmedText.startsWith('/rm ')) {
          const msgNumber = trimmedText.substring(4).trim();
          await this.handleDeleteMessage(msgNumber);
          continue;
        }

        // Handle /help command
        if (trimmedText === '/help') {
          this.showChatHelp();
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
   * Handle message deletion
   */
  async handleDeleteMessage(msgNumber) {
    const num = parseInt(msgNumber, 10);
    
    if (isNaN(num) || num < 1 || num > this.replies.length) {
      console.log(chalk.red(`\n❌ 無効なメッセージ番号: ${msgNumber}`));
      console.log(chalk.yellow(`💡 有効な番号: 1-${this.replies.length}`));
      return;
    }

    const message = this.replies[num - 1];
    
    try {
      await this.client.deleteMessage(this.channelId, message.ts);
      console.log(chalk.green(`\n✅ メッセージ [${num}] を削除しました`));
      
      // Refresh messages
      this.replies = await this.client.getThreadReplies(this.channelId, this.threadTs);
      this.displayMessages();
    } catch (error) {
      console.error(chalk.red(`\n❌ 削除失敗: ${error.message}`));
      console.log(chalk.yellow('💡 ヒント: 自分のメッセージか、適切な権限が必要です'));
    }
  }

  /**
   * Show chat help
   */
  showChatHelp() {
    console.log(chalk.cyan('\n📖 チャット中のコマンド:'));
    console.log(chalk.yellow('  /rm <番号>') + chalk.gray('  - 指定したメッセージを削除（例: /rm 5）'));
    console.log(chalk.yellow('  /help') + chalk.gray('      - このヘルプを表示'));
    console.log(chalk.yellow('  Ctrl+J') + chalk.gray('    - 改行を挿入（複数行メッセージ）'));
    console.log(chalk.yellow('  Ctrl+E') + chalk.gray('    - エディタ(vim/nano)を起動'));
    console.log(chalk.yellow('  Ctrl+C') + chalk.gray('    - 終了'));
    console.log();
  }

  /**
   * Send message and update display
   */
  async sendAndDisplay(text) {
    const result = await this.client.sendMessage(this.channelId, text, this.threadTs);

    // Add own message immediately
    this.replies.push({
      ts: result.ts,
      user: this.currentUser.displayName,
      text: text,
      timestamp: new Date()
    });

    // Refresh display
    this.displayMessages();

    // Fetch latest in background
    this.client.getThreadReplies(this.channelId, this.threadTs)
      .then(newReplies => {
        if (newReplies.length > this.replies.length) {
          this.replies = newReplies;
          this.displayNewMessages();
        }
      })
      .catch(() => {});
  }

  /**
   * Cleanup and exit
   */
  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    console.log(chalk.cyan('\n👋 終了しました。'));
    process.exit(0);
  }
}

async function threadChat(channelId, threadTs) {
  const session = new ThreadChatSession(channelId, threadTs);
  await session.start();
}

module.exports = { threadChat };
