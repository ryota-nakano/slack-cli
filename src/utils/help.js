/**
 * Help Command
 * Display usage information
 */

const chalk = require('chalk');

function showHelp() {
  const isUserToken = !!process.env.SLACK_USER_TOKEN;
  
  console.log(chalk.bold.cyan('\n📱 Slack CLI - Terminal-based Slack Chat\n'));
  
  console.log(chalk.white('使い方:'));
  console.log(chalk.green('  slack-cli channels') + chalk.gray('                      # チャンネル一覧'));
  console.log(chalk.green('  slack-cli thread <channel_id> <thread_ts>') + chalk.gray(' # スレッドチャット'));
  console.log();
  
  console.log(chalk.white('オプション:'));
  console.log(chalk.green('  --help, -h') + chalk.gray('                             # ヘルプ表示'));
  console.log();
  
  console.log(chalk.white('環境変数 (.env):'));
  console.log(chalk.yellow('  SLACK_USER_TOKEN') + chalk.gray('   - ユーザートークン（推奨）'));
  console.log(chalk.yellow('  SLACK_BOT_TOKEN') + chalk.gray('    - Botトークン'));
  console.log(chalk.yellow('  EDITOR') + chalk.gray('             - エディタ (vim, nano, etc.)'));
  console.log();
  
  console.log(chalk.white('チャット中のキー操作:'));
  console.log(chalk.green('  Enter') + chalk.gray('         - メッセージ送信'));
  console.log(chalk.green('  Ctrl+J') + chalk.gray('        - 改行挿入（複数行）'));
  console.log(chalk.green('  @入力') + chalk.gray('         - メンション補完 (Tab/↑↓で選択)'));
  console.log(chalk.green('  Ctrl+E') + chalk.gray('        - エディタモード (vim/nano等)'));
  console.log(chalk.green('  /rm <番号>') + chalk.gray('    - メッセージ削除 (例: /rm 5)'));
  console.log(chalk.green('  /help') + chalk.gray('         - チャット中のヘルプ'));
  console.log(chalk.green('  Ctrl+C') + chalk.gray('        - 終了'));
  console.log();
  
  console.log(chalk.white('現在の設定:'));
  const tokenMode = isUserToken ? chalk.green('👤 User Token') : chalk.blue('🤖 Bot Token');
  console.log(`  トークン: ${tokenMode}`);
  console.log(`  エディタ: ${chalk.cyan(process.env.EDITOR || process.env.VISUAL || 'vim')}`);
  console.log();
}

module.exports = { showHelp };
