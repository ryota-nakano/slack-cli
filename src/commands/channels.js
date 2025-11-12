/**
 * Channels Command
 * List all available channels
 */

const chalk = require('chalk');
const SlackClient = require('../api/slack-client');

async function listChannels() {
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  const client = new SlackClient(token);

  try {
    console.log(chalk.cyan('📋 チャンネル一覧を取得中...\n'));
    
    const channels = await client.listChannels();
    
    console.log(chalk.bold(`合計 ${channels.length} チャンネル\n`));
    console.log(chalk.gray('─'.repeat(80)));
    
    for (const channel of channels) {
      const icon = channel.is_private ? '🔒' : '#';
      const archived = channel.is_archived ? chalk.red(' [アーカイブ済み]') : '';
      console.log(`${icon} ${chalk.green(channel.name.padEnd(30))} ${chalk.gray(channel.id)}${archived}`);
    }
    
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.yellow(`\n💡 使い方: slack-cli thread <channel_id> <thread_ts>`));
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error.message);
    process.exit(1);
  }
}

module.exports = { listChannels };
