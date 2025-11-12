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
