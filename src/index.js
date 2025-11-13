#!/usr/bin/env node

/**
 * Slack CLI - Entry Point
 * Terminal-based Slack chat client
 */

const chalk = require('chalk');
const { loadConfig, hasValidConfig, runSetup, showConfig } = require('./utils/config');
const { listChannels } = require('./commands/channels');
const { threadChat, channelChat } = require('./commands/thread');
const { showHelp } = require('./utils/help');

// Load configuration
loadConfig();

async function main() {
  const args = process.argv.slice(2);
  
  // ヘルプオプションのチェック
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  const command = args[0];
  
  // Setup command (no token required)
  if (command === 'setup') {
    await runSetup();
    return;
  }
  
  // Config command (no token required)
  if (command === 'config') {
    showConfig();
    return;
  }
  
  // Validate token for other commands
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  if (!token) {
    if (!hasValidConfig()) {
      console.error(chalk.red('❌ エラー: Slack APIトークンが設定されていません\n'));
      console.log(chalk.yellow('以下のコマンドで設定してください:'));
      console.log(chalk.cyan('  slack setup\n'));
      process.exit(1);
    } else {
      console.error(chalk.red('❌ エラー: 設定ファイルの読み込みに失敗しました'));
      process.exit(1);
    }
  }
  
  // 引数なしの場合はチャット画面を表示
  if (args.length === 0) {
    await channelChat();
    return;
  }
  
  try {
    switch (command) {
      case 'channels':
      case 'list':
        await listChannels();
        break;
        
      case 'thread':
        if (args.length < 3) {
          console.error(chalk.red('❌ エラー: チャンネルIDとスレッドタイムスタンプが必要です'));
          console.log(chalk.yellow('使い方: slack thread <channel_id> <thread_ts>'));
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
