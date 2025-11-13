/**
 * Channel Chat Command
 * Interactive chat in a channel with history
 */

const chalk = require('chalk');
const SlackClient = require('../api/slack-client');
const ReadlineInput = require('../ui/readline-input');
const EditorInput = require('../ui/editor-input');
const { displayMessages } = require('../ui/thread-display');

async function channelChat() {
  const token = process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN;
  const client = new SlackClient(token);

  try {
    console.log(chalk.cyan('📋 チャンネルを選択してください...\n'));
    
    // Get all channels
    const channels = await client.listChannels();
    
    // Initial prompt with channel selection
    const readlineInput = new ReadlineInput([], channels);
    
    console.log(chalk.yellow('💡 ヒント: #を入力してチャンネルを検索・選択できます'));
    const result = await readlineInput.prompt('チャンネル選択');
    
    if (result === '__EMPTY__') {
      console.log(chalk.yellow('⚠️  入力がキャンセルされました'));
      return;
    }
    
    if (typeof result === 'object' && result.type === 'channel') {
      const selectedChannel = result.channel;
      
      // Get channel info and recent messages
      console.log(chalk.cyan(`\n📬 #${selectedChannel.name} の直近の投稿を取得中...\n`));
      
      const messages = await client.getChannelHistory(selectedChannel.id, 20);
      
      if (messages.length === 0) {
        console.log(chalk.gray('メッセージはまだありません'));
      } else {
        displayMessages(messages);
      }
      
      // Start chat loop in the selected channel
      await chatLoop(client, selectedChannel.id, selectedChannel.name);
    } else {
      console.log(chalk.yellow('⚠️  チャンネルが選択されませんでした'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error.message);
    process.exit(1);
  }
}

async function chatLoop(client, channelId, channelName) {
  const members = await client.getChannelMembers(channelId);
  const channels = await client.listChannels();
  
  console.log(chalk.cyan(`\n💬 #${channelName} でメッセージを送信できます`));
  console.log(chalk.gray('Ctrl+E: エディタモード | Ctrl+C: 終了\n'));
  
  while (true) {
    const readlineInput = new ReadlineInput(members, channels);
    const result = await readlineInput.prompt(channelName);
    
    if (result === '__EMPTY__') {
      continue;
    }
    
    if (result === '__EDITOR__') {
      const editorText = await EditorInput.prompt();
      if (editorText && editorText.trim()) {
        await sendMessage(client, channelId, channelName, editorText);
      }
      continue;
    }
    
    // Check if channel was selected
    if (typeof result === 'object' && result.type === 'channel') {
      const newChannel = result.channel;
      console.log(chalk.cyan(`\n📬 #${newChannel.name} に切り替えます...\n`));
      
      const messages = await client.getChannelHistory(newChannel.id, 20);
      if (messages.length > 0) {
        displayMessages(messages);
      }
      
      // Recurse into new channel
      await chatLoop(client, newChannel.id, newChannel.name);
      return;
    }
    
    if (result.startsWith('/')) {
      const handled = await handleCommand(client, channelId, channelName, result);
      if (handled === 'exit') return;
      continue;
    }
    
    await sendMessage(client, channelId, channelName, result);
  }
}

async function sendMessage(client, channelId, channelName, text) {
  try {
    await client.sendMessage(channelId, text);
    console.log(chalk.green('✓ 送信しました\n'));
  } catch (error) {
    console.error(chalk.red('❌ 送信失敗:'), error.message);
  }
}

async function handleCommand(client, channelId, channelName, command) {
  const parts = command.split(' ');
  const cmd = parts[0];
  
  switch (cmd) {
    case '/history':
    case '/h':
      const limit = parseInt(parts[1]) || 20;
      console.log(chalk.cyan(`\n📜 直近${limit}件の履歴を取得中...\n`));
      const messages = await client.getChannelHistory(channelId, limit);
      displayMessages(messages);
      return 'continue';
      
    case '/exit':
    case '/quit':
    case '/q':
      console.log(chalk.yellow('👋 終了します'));
      return 'exit';
      
    case '/help':
      console.log(chalk.cyan('\n📖 使用可能なコマンド:'));
      console.log(chalk.gray('  /history [件数] - 履歴を表示 (デフォルト: 20件)'));
      console.log(chalk.gray('  /h [件数]       - 履歴を表示 (短縮形)'));
      console.log(chalk.gray('  /exit           - チャット終了'));
      console.log(chalk.gray('  /help           - このヘルプを表示'));
      console.log(chalk.gray('  #channel        - チャンネル切り替え'));
      console.log(chalk.gray('  @user           - メンション補完\n'));
      return 'continue';
      
    default:
      console.log(chalk.red('❌ 不明なコマンド:'), cmd);
      console.log(chalk.gray('使用可能なコマンドは /help で確認できます\n'));
      return 'continue';
  }
}

module.exports = { channelChat };
