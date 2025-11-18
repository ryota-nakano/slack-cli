/**
 * Help Command
 * Display usage information
 */

const chalk = require('chalk');

function showHelp() {
  const isUserToken = !!process.env.SLACK_USER_TOKEN;
  
  console.log(chalk.bold.cyan('\n📱 Slack CLI - Terminal-based Slack Chat\n'));
  
  console.log(chalk.white('使い方:'));
  console.log(chalk.green('  slack') + chalk.gray('                                  # チャット開始'));
  console.log(chalk.green('  slack setup') + chalk.gray('                            # 初期設定'));
  console.log(chalk.green('  slack config') + chalk.gray('                           # 設定確認'));
  console.log(chalk.green('  slack clear-cache') + chalk.gray('                      # キャッシュクリア'));
  console.log(chalk.green('  slack channels') + chalk.gray('                         # チャンネル一覧'));
  console.log(chalk.green('  slack thread <channel_id> <thread_ts>') + chalk.gray(' # スレッドチャット'));
  console.log();
  
  console.log(chalk.white('オプション:'));
  console.log(chalk.green('  --help, -h') + chalk.gray('                             # ヘルプ表示'));
  console.log();
  
  console.log(chalk.white('設定ファイル:'));
  console.log(chalk.yellow('  ~/.config/slack-cli/config') + chalk.gray('   - 設定ファイル'));
  console.log(chalk.gray('  または .env ファイル（開発用）'));
  console.log();
  
  console.log(chalk.white('チャット中のキー操作:'));
  console.log(chalk.green('  Ctrl+Enter') + chalk.gray('    - メッセージ送信'));
  console.log(chalk.green('  Enter/Ctrl+J') + chalk.gray('  - 改行挿入'));
  console.log(chalk.green('  @入力 → Tab') + chalk.gray('  - メンション補完'));
  console.log(chalk.green('  #入力 → Tab') + chalk.gray('  - チャンネル選択'));
  console.log(chalk.green('  Ctrl+E') + chalk.gray('        - エディタモード'));
  console.log(chalk.green('  Ctrl+R') + chalk.gray('        - 今日の会話履歴'));
  console.log(chalk.green('  Ctrl+W') + chalk.gray('        - ブラウザで開く'));
  console.log(chalk.green('  /<番号>') + chalk.gray('       - スレッドに移動 (例: /3)'));
  console.log(chalk.green('  /back') + chalk.gray('         - スレッドから戻る'));
  console.log(chalk.green('  /r') + chalk.gray('            - 今日の会話履歴'));
  console.log(chalk.green('  /w') + chalk.gray('            - ブラウザで開く'));
  console.log(chalk.green('  /refresh') + chalk.gray('      - 今日の投稿を履歴に追加'));
  console.log(chalk.green('  /clear') + chalk.gray('        - 履歴キャッシュをクリア'));
  console.log(chalk.green('  /l <日数>') + chalk.gray('     - 過去の履歴読込 (例: /l 3)'));
  console.log(chalk.green('  /rm <番号>') + chalk.gray('    - メッセージ削除'));
  console.log(chalk.green('  /help') + chalk.gray('         - ヘルプ'));
  console.log(chalk.green('  Ctrl+C') + chalk.gray('        - 終了'));
  console.log();
  
  if (isUserToken !== undefined) {
    console.log(chalk.white('現在の設定:'));
    const tokenMode = isUserToken ? chalk.green('👤 User Token') : chalk.blue('🤖 Bot Token');
    console.log(`  トークン: ${tokenMode}`);
    console.log(`  エディタ: ${chalk.cyan(process.env.EDITOR || process.env.VISUAL || 'vim')}`);
    console.log();
  }
}

module.exports = { showHelp };
