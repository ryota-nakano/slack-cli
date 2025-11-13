/**
 * Thread Display
 * Handles thread message display and formatting
 */

const chalk = require('chalk');

class ThreadDisplay {
  constructor(channelName) {
    this.channelName = channelName;
  }

  /**
   * Display all messages in thread
   */
  displayMessages(replies) {
    console.clear();
    console.log(chalk.bold.cyan(`\n#${this.channelName} のスレッド`));
    console.log(chalk.gray('='.repeat(80)));
    console.log('');

    // Show last 30 messages
    const displayReplies = replies.slice(-30);

    displayReplies.forEach((reply, i) => {
      const time = reply.timestamp.toLocaleString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const prefix = i === 0 ? '📌' : '  ↳';
      const index = replies.length - displayReplies.length + i + 1;
      
      // Format index with fixed width (right-aligned, 3 chars)
      const indexStr = String(index).padStart(3, ' ');
      
      // Show thread indicator with fixed width
      const threadIndicator = reply.hasThread 
        ? chalk.blue(`[💬${String(reply.replyCount).padStart(2, ' ')}]`) 
        : '      '; // 6 spaces to match [💬NN]
      
      // Format user name with fixed width (left-aligned, 12 chars)
      const userStr = reply.user.padEnd(12, ' ').substring(0, 12);
      
      console.log(`${prefix} ${chalk.gray(indexStr)} ${chalk.gray(time)} ${threadIndicator} ${chalk.yellow(userStr)} ${reply.text}`);
    });

    console.log('');
    console.log(chalk.gray('='.repeat(80)));
    console.log(chalk.bold(`💬 合計 ${replies.length} 件の返信`));
    console.log(chalk.gray('💡 Enter: 送信 | @[Tab]: メンション | #[Tab]: チャンネル切替 | Ctrl+E: エディタ | /help: ヘルプ'));
    console.log('');
  }

  /**
   * Display only new messages
   */
  displayNewMessages(newReplies) {
    console.log(chalk.cyan('\n🔔 新着メッセージ:'));
    
    newReplies.forEach(reply => {
      const time = reply.timestamp.toLocaleString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Show thread indicator with fixed width
      const threadIndicator = reply.hasThread 
        ? chalk.blue(`[💬${String(reply.replyCount).padStart(2, ' ')}]`) 
        : '      '; // 6 spaces
      
      // Format user name with fixed width
      const userStr = reply.user.padEnd(12, ' ').substring(0, 12);
      
      console.log(`  ↳ ${chalk.gray(time)} ${threadIndicator} ${chalk.yellow(userStr)} ${reply.text}`);
    });
  }
}

/**
 * Standalone function to display messages (for channel history)
 */
function displayMessages(messages) {
  messages.forEach((msg, i) => {
    const time = msg.timestamp.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Format index with fixed width (right-aligned, 3 chars)
    const indexStr = String(i + 1).padStart(3, ' ');

    // Show thread indicator with fixed width
    const threadIndicator = msg.hasThread 
      ? chalk.blue(`[💬${String(msg.replyCount).padStart(2, ' ')}]`) 
      : '      '; // 6 spaces

    // Format user name with fixed width (left-aligned, 12 chars)
    const userStr = msg.user.padEnd(12, ' ').substring(0, 12);

    console.log(`${chalk.gray(indexStr)} ${chalk.gray(time)} ${threadIndicator} ${chalk.yellow(userStr)} ${msg.text}`);
  });
  console.log('');
}

module.exports = ThreadDisplay;
module.exports.displayMessages = displayMessages;
