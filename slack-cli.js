#!/usr/bin/env node

/**
 * Slack CLI - Node.js版
 * Python版と同等の機能を持つ高機能CLIツール
 */

require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const blessed = require('blessed');
const chalk = require('chalk');

// Slackクライアントの初期化
const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error(chalk.red('エラー: SLACK_USER_TOKEN または SLACK_BOT_TOKEN が設定されていません'));
  console.error(chalk.yellow('ヒント: .envファイルに設定してください'));
  process.exit(1);
}

const client = new WebClient(token);
const isUserToken = !!process.env.SLACK_USER_TOKEN;

// ヘルプメッセージ
function showHelp() {
  console.log(chalk.bold.cyan('\n📱 Slack CLI - Node.js版\n'));
  console.log(chalk.white('使い方:'));
  console.log(chalk.green('  node slack-cli.js channels') + chalk.gray('           # チャンネル一覧'));
  console.log(chalk.green('  node slack-cli.js chat <channel_id>') + chalk.gray('  # チャンネルにメッセージ送信'));
  console.log(chalk.green('  node slack-cli.js thread <channel_id> <thread_ts>') + chalk.gray(' # スレッドチャット'));
  console.log();
  console.log(chalk.white('オプション:'));
  console.log(chalk.green('  --help, -h') + chalk.gray('                        # ヘルプ表示'));
  console.log();
  console.log(chalk.white('環境変数:'));
  console.log(chalk.yellow('  SLACK_USER_TOKEN') + chalk.gray('  - ユーザートークン（推奨）'));
  console.log(chalk.yellow('  SLACK_BOT_TOKEN') + chalk.gray('   - Botトークン'));
  console.log();
  console.log(chalk.white('現在のモード:') + ' ' + (isUserToken ? chalk.green('👤 User') : chalk.blue('🤖 Bot')));
  console.log();
}

// チャンネル一覧を表示
async function listChannels() {
  try {
    console.log(chalk.cyan('📋 チャンネル一覧を取得中...\n'));
    
    const result = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200
    });

    const channels = result.channels || [];
    
    console.log(chalk.bold(`合計 ${channels.length} チャンネル\n`));
    console.log(chalk.gray('─'.repeat(80)));
    
    for (const channel of channels) {
      const icon = channel.is_private ? '🔒' : '#';
      const archived = channel.is_archived ? chalk.red(' [アーカイブ済み]') : '';
      console.log(`${icon} ${chalk.green(channel.name.padEnd(30))} ${chalk.gray(channel.id)}${archived}`);
    }
    
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.yellow(`\n💡 使い方: node slack-cli.js thread <channel_id> <thread_ts>`));
    
  } catch (error) {
    console.error(chalk.red('エラー:'), error.message);
    process.exit(1);
  }
}

// チャンネル情報を取得
async function getChannelInfo(channelId) {
  try {
    const result = await client.conversations.info({
      channel: channelId
    });
    return result.channel;
  } catch (error) {
    return null;
  }
}

// チャンネルメンバーを取得
async function getChannelMembers(channelId) {
  try {
    const result = await client.conversations.members({
      channel: channelId
    });
    
    const memberIds = result.members || [];
    const members = [];
    
    // ユーザー情報を取得
    for (const userId of memberIds) {
      try {
        const userInfo = await client.users.info({ user: userId });
        const user = userInfo.user;
        
        if (!user.is_bot && !user.deleted) {
          members.push({
            id: user.id,
            name: user.name,
            realName: user.real_name || user.name,
            displayName: user.profile.display_name || user.name
          });
        }
      } catch (err) {
        // ユーザー情報取得失敗は無視
      }
    }
    
    return members;
  } catch (error) {
    return [];
  }
}

// スレッドの返信を取得
async function getThreadReplies(channelId, threadTs) {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 100
    });
    
    const messages = result.messages || [];
    const replies = [];
    
    for (const msg of messages) {
      // ユーザー情報を取得
      let userName = 'Unknown';
      if (msg.user) {
        try {
          const userInfo = await client.users.info({ user: msg.user });
          userName = userInfo.user.profile.display_name || userInfo.user.real_name || userInfo.user.name;
        } catch (err) {
          userName = msg.user;
        }
      } else if (msg.bot_id) {
        userName = msg.username || 'Bot';
      }
      
      replies.push({
        ts: msg.ts,
        user: userName,
        text: msg.text,
        timestamp: new Date(parseFloat(msg.ts) * 1000)
      });
    }
    
    return replies;
  } catch (error) {
    console.error('スレッド取得エラー:', error.message);
    return [];
  }
}

// メッセージを送信
async function sendMessage(channelId, text, threadTs = null) {
  try {
    const params = {
      channel: channelId,
      text: text
    };
    
    if (threadTs) {
      params.thread_ts = threadTs;
    }
    
    const result = await client.chat.postMessage(params);
    return result;
  } catch (error) {
    throw error;
  }
}

// スレッドチャット（インタラクティブモード）
async function threadChat(channelId, threadTs) {
  console.log(chalk.cyan('🔄 スレッド情報を取得中...\n'));
  
  // チャンネル情報を取得
  const channel = await getChannelInfo(channelId);
  const channelName = channel ? channel.name : channelId;
  
  // メンバー情報を取得
  console.log(chalk.cyan('👥 メンバー情報を取得中...'));
  const members = await getChannelMembers(channelId);
  
  // 初期のスレッド返信を取得
  let replies = await getThreadReplies(channelId, threadTs);
  
  // Blessedスクリーンの作成
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    title: `Slack - #${channelName}`
  });
  
  // メッセージ表示エリア
  const messageBox = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-5',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '█',
      style: {
        fg: 'blue'
      }
    },
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    keys: true,
    vi: true,
    mouse: true
  });
  
  // ヘッダー
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: `#${channelName} [スレッド] | メンバー: ${members.length}人 | Enter: 送信 | Ctrl+J: 改行 | Ctrl+C: 終了`,
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true
    }
  });
  
  // 入力エリア
  const inputBox = blessed.textarea({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 4,
    inputOnFocus: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'green'
      },
      focus: {
        border: {
          fg: 'yellow'
        }
      }
    },
    keys: true,
    mouse: true
  });
  
  screen.append(header);
  screen.append(messageBox);
  screen.append(inputBox);
  
  // メッセージを表示する関数
  function displayMessages() {
    const lines = [];
    lines.push('');
    lines.push(chalk.bold.cyan(`#${channelName} のスレッド`));
    lines.push(chalk.gray('='.repeat(80)));
    lines.push('');
    
    // 最新20件を表示
    const displayReplies = replies.slice(-20);
    
    for (let i = 0; i < displayReplies.length; i++) {
      const reply = displayReplies[i];
      const time = reply.timestamp.toLocaleString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      const prefix = i === 0 ? '📌' : '  ↳';
      lines.push(`${prefix} ${chalk.gray(`[${i + 1}]`)} ${chalk.gray(`[${time}]`)} ${chalk.yellow(reply.user)}: ${reply.text}`);
    }
    
    lines.push('');
    lines.push(chalk.gray('='.repeat(80)));
    lines.push(chalk.bold(`💬 合計 ${replies.length} 件の返信`));
    lines.push('');
    
    messageBox.setContent(lines.join('\n'));
    messageBox.setScrollPerc(100);
    screen.render();
  }
  
  // 初期表示
  displayMessages();
  
  // 入力エリアにフォーカス
  inputBox.focus();
  
  // メンション補完
  let mentionMode = false;
  let mentionQuery = '';
  let mentionCandidates = [];
  let mentionIndex = 0;
  
  function updateMentionCandidates(query) {
    const q = query.toLowerCase();
    mentionCandidates = members.filter(m => 
      m.name.toLowerCase().includes(q) ||
      m.realName.toLowerCase().includes(q) ||
      m.displayName.toLowerCase().includes(q)
    ).slice(0, 10);
    mentionIndex = 0;
  }
  
  function showMentionSuggestions() {
    if (mentionCandidates.length === 0) return '';
    
    const suggestions = mentionCandidates.map((m, i) => {
      const marker = i === mentionIndex ? '>' : ' ';
      return `${marker} @${m.name} (${m.realName})`;
    }).join('\n');
    
    return `\n${chalk.cyan('候補:')}\n${suggestions}`;
  }
  
  // キーバインディング
  inputBox.key(['C-j'], function() {
    // Ctrl+J: 改行
    const value = inputBox.getValue();
    const cursorPos = inputBox.value.length;
    inputBox.setValue(value + '\n');
    screen.render();
  });
  
  inputBox.key(['C-h'], function() {
    // Ctrl+H: Backspace
    const value = inputBox.getValue();
    if (value.length > 0) {
      inputBox.setValue(value.slice(0, -1));
      screen.render();
    }
  });
  
  inputBox.key(['enter'], async function() {
    // Enter: 送信
    const text = inputBox.getValue().trim();
    
    if (text.length === 0) return;
    
    try {
      // メッセージ送信
      await sendMessage(channelId, text, threadTs);
      
      // 入力クリア
      inputBox.setValue('');
      
      // 少し待ってから更新
      setTimeout(async () => {
        replies = await getThreadReplies(channelId, threadTs);
        displayMessages();
      }, 300);
      
    } catch (error) {
      header.setContent(`エラー: ${error.message} | Ctrl+C: 終了`);
      screen.render();
    }
  });
  
  // タブキー: メンション候補選択
  inputBox.key(['tab'], function() {
    const value = inputBox.getValue();
    const lastAtIndex = value.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const query = value.substring(lastAtIndex + 1);
      updateMentionCandidates(query);
      
      if (mentionCandidates.length > 0) {
        const selected = mentionCandidates[mentionIndex];
        const beforeAt = value.substring(0, lastAtIndex);
        inputBox.setValue(`${beforeAt}<@${selected.id}> `);
        screen.render();
      }
    }
  });
  
  // 下矢印: メンション候補移動
  inputBox.key(['down'], function() {
    const value = inputBox.getValue();
    const lastAtIndex = value.lastIndexOf('@');
    
    if (lastAtIndex !== -1 && mentionCandidates.length > 0) {
      mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
      header.setContent(`候補: ${mentionCandidates[mentionIndex].name} | Tab: 選択 | Ctrl+C: 終了`);
      screen.render();
    }
  });
  
  // Ctrl+C: 終了
  screen.key(['C-c'], function() {
    return process.exit(0);
  });
  
  // 定期的にスレッドを更新（2秒ごと）
  const updateInterval = setInterval(async () => {
    try {
      const oldCount = replies.length;
      replies = await getThreadReplies(channelId, threadTs);
      
      if (replies.length > oldCount) {
        displayMessages();
      }
    } catch (error) {
      // エラーは無視
    }
  }, 2000);
  
  // 終了時にインターバルをクリア
  screen.on('destroy', () => {
    clearInterval(updateInterval);
  });
  
  screen.render();
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'channels':
      await listChannels();
      break;
      
    case 'thread':
      if (args.length < 3) {
        console.error(chalk.red('エラー: チャンネルIDとスレッドIDが必要です'));
        console.log(chalk.yellow('使い方: node slack-cli.js thread <channel_id> <thread_ts>'));
        process.exit(1);
      }
      await threadChat(args[1], args[2]);
      break;
      
    case 'chat':
      console.error(chalk.red('エラー: chat コマンドは未実装です'));
      console.log(chalk.yellow('thread コマンドを使用してください'));
      process.exit(1);
      break;
      
    default:
      console.error(chalk.red(`エラー: 不明なコマンド '${command}'`));
      showHelp();
      process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('エラー:'), error.message);
  process.exit(1);
});

// 実行
main().catch(error => {
  console.error(chalk.red('エラー:'), error.message);
  process.exit(1);
});
