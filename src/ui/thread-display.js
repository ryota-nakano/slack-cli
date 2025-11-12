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
  displayMessages(replies, membersLoaded, memberCount) {
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
      console.log(`${prefix} ${chalk.gray(`[${index}]`)} ${chalk.gray(`[${time}]`)} ${chalk.yellow(reply.user)}: ${reply.text}`);
    });

    console.log('');
    console.log(chalk.gray('='.repeat(80)));
    console.log(chalk.bold(`💬 合計 ${replies.length} 件の返信`));
    
    const mentionStatus = membersLoaded 
      ? chalk.green(`✓ メンション候補: ${memberCount}人`)
      : chalk.yellow('⏳ メンション候補読込中...');
    console.log(chalk.gray('💡 Enter: 送信 | @入力: メンション | Ctrl+E: エディタ | Ctrl+C: 終了'));
    console.log(mentionStatus);
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
      console.log(`  ↳${chalk.gray(`[${time}]`)} ${chalk.yellow(reply.user)}: ${reply.text}`);
    });
  }
}

module.exports = ThreadDisplay;
