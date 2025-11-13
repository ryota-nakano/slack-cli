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
      
      // Show thread indicator
      const threadIndicator = reply.hasThread 
        ? chalk.blue(` [💬${reply.replyCount}]`) 
        : '';
      
      // First line: Number (bright), time, thread indicator, user
      console.log(`${prefix} ${chalk.bold.white(`[${index}]`)} ${chalk.gray(time)}${threadIndicator} ${chalk.yellow(reply.user)}`);
      // Second line: Message text (indented)
      console.log(`     ${reply.text}`);
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
      
      // Show thread indicator
      const threadIndicator = reply.hasThread 
        ? chalk.blue(` [💬${reply.replyCount}]`) 
        : '';
      
      // First line: time, thread indicator, user
      console.log(`  ↳ ${chalk.gray(time)}${threadIndicator} ${chalk.yellow(reply.user)}`);
      // Second line: Message text (indented)
      console.log(`     ${reply.text}`);
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

    // Show thread indicator
    const threadIndicator = msg.hasThread 
      ? chalk.blue(` [💬${msg.replyCount}]`) 
      : '';

    // First line: Number (bright), time, thread indicator, user
    console.log(`${chalk.bold.white(`[${i + 1}]`)} ${chalk.gray(time)}${threadIndicator} ${chalk.yellow(msg.user)}`);
    // Second line: Message text (indented)
    console.log(`     ${msg.text}`);
  });
  console.log('');
}

module.exports = ThreadDisplay;
module.exports.displayMessages = displayMessages;
