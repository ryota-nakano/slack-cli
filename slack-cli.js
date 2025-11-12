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

// ユーザー情報キャッシュ
const userCache = new Map();

// ユーザー情報を取得（キャッシュ付き）
async function getUserInfo(userId) {
  if (userCache.has(userId)) {
    return userCache.get(userId);
  }
  
  try {
    const userInfo = await client.users.info({ user: userId });
    const user = userInfo.user;
    const info = {
      id: user.id,
      name: user.name,
      realName: user.real_name || user.name,
      displayName: user.profile.display_name || user.real_name || user.name,
      isBot: user.is_bot || false,
      deleted: user.deleted || false
    };
    
    userCache.set(userId, info);
    return info;
  } catch (error) {
    // エラー時はユーザーIDをそのまま返す
    return {
      id: userId,
      name: userId,
      realName: userId,
      displayName: userId,
      isBot: false,
      deleted: false
    };
  }
}

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
      channel: channelId,
      limit: 100
    });
    
    const memberIds = result.members || [];
    const members = [];
    
    // バッチでユーザー情報を取得（rate limitを避けるため遅延を入れる）
    for (let i = 0; i < memberIds.length; i++) {
      try {
        const userId = memberIds[i];
        const user = await getUserInfo(userId);
        
        if (!user.isBot && !user.deleted) {
          members.push(user);
        }
        
        // 10件ごとに少し待つ（rate limit対策）
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        // 個別のエラーは無視
        continue;
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
      // ユーザー情報を取得（キャッシュ使用）
      let userName = 'Unknown';
      if (msg.user) {
        const user = await getUserInfo(msg.user);
        userName = user.displayName;
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
  
  // 自分のユーザー情報を取得
  let currentUserId = null;
  let currentUserName = 'あなた';
  try {
    const authTest = await client.auth.test();
    currentUserId = authTest.user_id;
    const userInfo = await getUserInfo(currentUserId);
    currentUserName = userInfo.displayName;
  } catch (error) {
    // エラーは無視
  }
  
  // メンバー情報を非同期で取得（UIをブロックしない）
  let members = [];
  let membersLoading = true;
  
  // 初期のスレッド返信を取得
  let replies = await getThreadReplies(channelId, threadTs);
  
  // メンバー情報を裏で取得
  getChannelMembers(channelId).then(loadedMembers => {
    members = loadedMembers;
    membersLoading = false;
    // ヘッダーを更新
    if (header) {
      header.setContent(`#${channelName} [スレッド] | メンバー: ${members.length}人 | Enter: 送信 | Ctrl+J: 改行 | @でメンション(Tab/↑↓) | Ctrl+C: 終了`);
      screen.render();
    }
  }).catch(() => {
    membersLoading = false;
  });
  
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
    content: `#${channelName} [スレッド] | メンバー情報取得中... | Enter: 送信 | Ctrl+J: 改行 | @でメンション(Tab/↑↓) | Ctrl+C: 終了`,
    style: {
      fg: 'white',
      bg: 'blue',
      bold: true
    }
  });
  
  // メンション候補表示エリア
  const mentionBox = blessed.box({
    bottom: 4,
    left: 0,
    width: '100%',
    height: 0,  // 初期は非表示
    content: '',
    style: {
      fg: 'cyan',
      bg: 'black',
      border: {
        fg: 'cyan'
      }
    },
    border: {
      type: 'line'
    },
    hidden: true
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
    mouse: true,
    vi: false,  // viモードを無効化
    wrap: true
  });
  
  screen.append(header);
  screen.append(messageBox);
  screen.append(mentionBox);
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
  let mentionStartPos = -1;
  
  function updateMentionCandidates(query) {
    const q = query.toLowerCase();
    mentionCandidates = members.filter(m => 
      m.name.toLowerCase().includes(q) ||
      m.realName.toLowerCase().includes(q) ||
      m.displayName.toLowerCase().includes(q)
    ).slice(0, 10);
    mentionIndex = 0;
    
    // 候補を表示
    if (mentionCandidates.length > 0 && !membersLoading) {
      const lines = [chalk.cyan.bold('メンション候補 (Tab:選択 ↑↓/Ctrl+N/P:移動)')];
      mentionCandidates.forEach((m, i) => {
        const marker = i === mentionIndex ? chalk.yellow('▶') : '  ';
        lines.push(`${marker} @${m.name} (${m.realName})`);
      });
      mentionBox.setContent(lines.join('\n'));
      mentionBox.height = Math.min(mentionCandidates.length + 3, 10);
      mentionBox.show();
      screen.render();
    } else {
      mentionBox.hide();
      screen.render();
    }
  }
  
  function showMentionSuggestions() {
    if (mentionCandidates.length === 0) return '';
    
    const suggestions = mentionCandidates.map((m, i) => {
      const marker = i === mentionIndex ? '>' : ' ';
      return `${marker} @${m.name} (${m.realName})`;
    }).join('\n');
    
    return `\n${chalk.cyan('候補:')}\n${suggestions}`;
  }
  
  function checkMentionMode() {
    const value = inputBox.getValue();
    const lastAtIndex = value.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const afterAt = value.substring(lastAtIndex + 1);
      // @の後にスペースや改行がなければメンションモード
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        mentionMode = true;
        mentionStartPos = lastAtIndex;
        updateMentionCandidates(afterAt);
        return true;
      }
    }
    
    mentionMode = false;
    mentionCandidates = [];
    mentionBox.hide();
    screen.render();
    return false;
  }
  
  // キーバインディング
  
  // 矢印キー: メンション候補表示時のみ候補移動をフックし、それ以外はデフォルトのカーソル移動を維持
  inputBox.key(['up'], function() {
    if (!(mentionMode && mentionCandidates.length > 0)) {
      // メンションモードでなければ何もしない -> blessed標準のカーソル移動に任せる
      return; 
    }
    mentionIndex = (mentionIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
    const lines = [chalk.cyan.bold('メンション候補 (Tab:選択 ↑↓/Ctrl+N/P:移動)')];
    mentionCandidates.forEach((m, i) => {
      const marker = i === mentionIndex ? chalk.yellow('▶') : '  ';
      lines.push(`${marker} @${m.name} (${m.realName})`);
    });
    mentionBox.setContent(lines.join('\n'));
    screen.render();
    return false; // イベントを止める（候補移動時のみ）
  });
  
  inputBox.key(['down'], function() {
    if (!(mentionMode && mentionCandidates.length > 0)) {
      return; // 標準カーソル移動
    }
    mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
    const lines = [chalk.cyan.bold('メンション候補 (Tab:選択 ↑↓/Ctrl+N/P:移動)')];
    mentionCandidates.forEach((m, i) => {
      const marker = i === mentionIndex ? chalk.yellow('▶') : '  ';
      lines.push(`${marker} @${m.name} (${m.realName})`);
    });
    mentionBox.setContent(lines.join('\n'));
    screen.render();
    return false; 
  });
  
  // タブキー: メンション候補選択
  inputBox.key(['tab'], function() {
    if (mentionMode && mentionCandidates.length > 0 && !membersLoading && members.length > 0) {
      const selected = mentionCandidates[mentionIndex];
      const value = inputBox.getValue();
      const beforeAt = value.substring(0, mentionStartPos);
      const afterMention = value.substring(value.lastIndexOf('@') + 1).replace(/^\S+/, '');
      inputBox.setValue(`${beforeAt}<@${selected.id}> ${afterMention}`);
      mentionMode = false;
      mentionCandidates = [];
      mentionBox.hide();
      screen.render();
    }
  });
  
  // テキスト入力時にメンションモードをチェック
  inputBox.on('keypress', function(ch, key) {
    // 特殊キーの処理後にメンションモードをチェック
    setTimeout(() => {
      checkMentionMode();
    }, 10);
  });
  
  inputBox.key(['C-j'], function() {
    // Ctrl+J: 改行
    const value = inputBox.getValue();
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
      const result = await sendMessage(channelId, text, threadTs);
      
      // 送信した自分のメッセージを即座に表示に追加
      replies.push({
        ts: result.ts,
        user: currentUserName,
        text: text,
        timestamp: new Date()
      });
      displayMessages();
      
      // 入力クリア
      inputBox.setValue('');
      
      // バックグラウンドで最新のスレッド情報を取得
      getThreadReplies(channelId, threadTs).then(newReplies => {
        replies = newReplies;
        displayMessages();
      }).catch(() => {
        // エラーは無視
      });
      
    } catch (error) {
      const memberCount = membersLoading ? '取得中...' : `${members.length}人`;
      header.setContent(`エラー: ${error.message} | Ctrl+C: 終了`);
      screen.render();
      
      setTimeout(() => {
        header.setContent(`#${channelName} [スレッド] | メンバー: ${memberCount} | Enter: 送信 | Ctrl+J: 改行 | @でメンション(Tab/↑↓) | Ctrl+C: 終了`);
        screen.render();
      }, 3000);
    }
  });
  
  // Ctrl+P: メンション候補を上に移動
  inputBox.key(['C-p'], function() {
    if (mentionMode && mentionCandidates.length > 0) {
      mentionIndex = (mentionIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
      // 候補リストを更新
      const lines = [chalk.cyan.bold('メンション候補 (Tab:選択 ↑↓/Ctrl+N/P:移動)')];
      mentionCandidates.forEach((m, i) => {
        const marker = i === mentionIndex ? chalk.yellow('▶') : '  ';
        lines.push(`${marker} @${m.name} (${m.realName})`);
      });
      mentionBox.setContent(lines.join('\n'));
      screen.render();
    }
  });
  
  // Ctrl+N: メンション候補を下に移動
  inputBox.key(['C-n'], function() {
    if (mentionMode && mentionCandidates.length > 0) {
      mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
      // 候補リストを更新
      const lines = [chalk.cyan.bold('メンション候補 (Tab:選択 ↑↓/Ctrl+N/P:移動)')];
      mentionCandidates.forEach((m, i) => {
        const marker = i === mentionIndex ? chalk.yellow('▶') : '  ';
        lines.push(`${marker} @${m.name} (${m.realName})`);
      });
      mentionBox.setContent(lines.join('\n'));
      screen.render();
    }
  });
  
  // Ctrl+C: 終了
  const exitHandler = function() {
    clearInterval(updateInterval);
    process.stdin.setRawMode(false);
    screen.destroy();
    console.log('\n終了しました。');
    process.exit(0);
  };
  
  inputBox.key(['C-c'], exitHandler);
  screen.key(['C-c'], exitHandler);
  
  // 定期的にスレッドを更新（2秒ごと）
  const updateInterval = setInterval(async () => {
    try {
      const oldCount = replies.length;
      const newReplies = await getThreadReplies(channelId, threadTs);
      
      // 新しいメッセージがある場合、または件数が異なる場合に更新
      if (newReplies.length !== oldCount || 
          (newReplies.length > 0 && replies.length > 0 && 
           newReplies[newReplies.length - 1].ts !== replies[replies.length - 1].ts)) {
        replies = newReplies;
        displayMessages();
        
        if (newReplies.length > oldCount) {
          // 新着通知
          const diff = newReplies.length - oldCount;
          const memberCount = membersLoading ? '取得中...' : `${members.length}人`;
          header.setContent(`#${channelName} [スレッド] | 🔔 ${diff}件の新着 | Enter: 送信 | Ctrl+J: 改行 | @でメンション(Tab/↑↓) | Ctrl+C: 終了`);
          screen.render();
          setTimeout(() => {
            header.setContent(`#${channelName} [スレッド] | メンバー: ${memberCount} | Enter: 送信 | Ctrl+J: 改行 | @でメンション(Tab/↑↓) | Ctrl+C: 終了`);
            screen.render();
          }, 2000);
        }
      }
    } catch (error) {
      // エラーは無視（ログに出力しない）
    }
  }, 2000);
  
  // プロセス終了時のクリーンアップ
  const cleanup = () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      screen.destroy();
    } catch (e) {
      // エラーは無視
    }
    console.log('\n終了しました。');
    process.exit(0);
  };
  
  // 各種終了シグナルをハンドル
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
  
  // 終了時にインターバルをクリア
  screen.on('destroy', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
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
