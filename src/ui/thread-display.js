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
   * @param {Array} replies - Messages to display
   * @param {number} startIndex - Starting index for numbering (for partial display)
   */
  displayMessages(replies, startIndex = 0) {
    console.clear();
    console.log(chalk.bold.cyan(`\n#${this.channelName} のスレッド`));
    console.log(chalk.gray('='.repeat(80)));
    console.log('');

    // Show all messages
    const displayReplies = replies;

    displayReplies.forEach((reply, i) => {
      // Convert ts (Unix timestamp as string) to Date
      const timestamp = new Date(parseFloat(reply.ts) * 1000);
      const time = timestamp.toLocaleString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Use actual index in the full thread
      const index = startIndex + i + 1;
      
      // Show thread indicator
      const threadIndicator = reply.reply_count > 0
        ? chalk.blue(` [💬${reply.reply_count}]`) 
        : '';
      
      // First line: Number (white bg, black text), time, thread indicator, user (green)
      console.log(`${chalk.bgWhite.black(` ${index} `)} ${chalk.gray(time)}${threadIndicator} ${chalk.green(reply.userName || reply.user)}`);
      
      // Second line: Message text (no indent, handle multi-line)
      const lines = reply.text.split('\n');
      lines.forEach(line => {
        console.log(line);
      });
      
      // Show file attachments if present
      if (reply.files && reply.files.length > 0) {
        reply.files.forEach(file => {
          console.log(chalk.cyan(`📎 ${file.title || file.name}: ${file.url}`));
        });
      }
      
      // Add blank line between messages
      console.log('');
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
      // Convert ts (Unix timestamp as string) to Date
      const timestamp = new Date(parseFloat(reply.ts) * 1000);
      const time = timestamp.toLocaleString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Show thread indicator
      const threadIndicator = reply.reply_count > 0
        ? chalk.blue(` [💬${reply.reply_count}]`) 
        : '';
      
      // First line: time, thread indicator, user (green)
      console.log(`${chalk.gray(time)}${threadIndicator} ${chalk.green(reply.userName || reply.user)}`);
      
      // Second line: Message text (no indent, handle multi-line)
      const lines = reply.text.split('\n');
      lines.forEach(line => {
        console.log(line);
      });
      
      // Show file attachments if present
      if (reply.files && reply.files.length > 0) {
        reply.files.forEach(file => {
          console.log(chalk.cyan(`📎 ${file.title || file.name}: ${file.url}`));
        });
      }
      
      // Add blank line between messages
      console.log('');
    });
  }
}

/**
 * Standalone function to display messages (for channel history)
 */
function displayMessages(messages) {
  messages.forEach((msg, i) => {
    // Convert ts (Unix timestamp as string) to Date
    const timestamp = new Date(parseFloat(msg.ts) * 1000);
    const time = timestamp.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Show thread indicator
    const threadIndicator = msg.reply_count > 0
      ? chalk.blue(` [💬${msg.reply_count}]`) 
      : '';

    // First line: Number (white bg, black text), time, thread indicator, user (green)
    console.log(`${chalk.bgWhite.black(` ${i + 1} `)} ${chalk.gray(time)}${threadIndicator} ${chalk.green(msg.userName || msg.user)}`);
    
    // Second line: Message text (no indent, handle multi-line)
    const lines = msg.text.split('\n');
    lines.forEach(line => {
      console.log(line);
    });
    
    // Show file attachments if present
    if (msg.files && msg.files.length > 0) {
      msg.files.forEach(file => {
        console.log(chalk.cyan(`📎 ${file.title || file.name}: ${file.url}`));
      });
    }
    
    // Add blank line between messages
    console.log('');
  });
  console.log('');
}

module.exports = ThreadDisplay;
module.exports.displayMessages = displayMessages;
