#!/usr/bin/env node

/**
 * Slack CLI - Entry Point
 * Terminal-based Slack chat client
 */

const path = require('path');
const fs = require('fs');

// Load .env from project root (where package.json is)
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // Fallback to current directory
  require('dotenv').config();
}

const chalk = require('chalk');
const { listChannels } = require('./commands/channels');
const { threadChat, channelChat } = require('./commands/thread');
const { showHelp } = require('./utils/help');

// Validate environment
const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error(chalk.red('❌ エラー: SLACK_USER_TOKEN または SLACK_BOT_TOKEN が設定されていません'));
  console.error(chalk.yellow('💡 ヒント: .envファイルにトークンを設定してください'));
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  // 引数なしの場合はチャンネル選択を表示
  if (args.length === 0) {
    await listChannels();
    return;
  }
  
  const command = args[0];
  
  try {
    switch (command) {
      case 'channels':
      case 'list':
        await listChannels();
        break;
        
      case 'thread':
        if (args.length < 3) {
          console.error(chalk.red('❌ エラー: チャンネルIDとスレッドタイムスタンプが必要です'));
          console.log(chalk.yellow('使い方: slack-cli thread <channel_id> <thread_ts>'));
          process.exit(1);
        }
        await threadChat(args[1], args[2]);
        break;
        
      case 'channel':
      case 'chat':
        await channelChat();
        break;
        
      default:
        console.error(chalk.red(`❌ エラー: 不明なコマンド '${command}'`));
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error.message);
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ 予期しないエラー:'), error.message);
  process.exit(1);
});

// Run
main();
