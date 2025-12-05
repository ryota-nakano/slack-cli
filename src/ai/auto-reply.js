/**
 * Auto Reply Module
 * Automatically responds to mentions and direct messages using OpenAI
 */

const OpenAI = require('openai');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AutoReply {
  constructor(slackClient, currentUserId) {
    this.slackClient = slackClient;
    this.currentUserId = currentUserId;
    this.enabled = false;
    this.replyAllMode = false; // Reply to ALL messages (aggressive mode)
    this.openai = null;
    this.processedMessages = new Set(); // Track already processed message timestamps
    this.maxContextMessages = 20; // Maximum number of context messages to include
    this.replyHistory = []; // Store reply history for reporting
    this.historyFile = path.join(os.homedir(), '.config', 'slack-cli', 'auto-reply-history.json');
    
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    // Load existing history
    this.loadHistory();
  }

  /**
   * Load reply history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf-8');
        this.replyHistory = JSON.parse(data);
      }
    } catch (error) {
      // Ignore errors, start with empty history
      this.replyHistory = [];
    }
  }

  /**
   * Save reply history to file
   */
  saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.historyFile, JSON.stringify(this.replyHistory, null, 2));
    } catch (error) {
      console.error(chalk.red(`履歴の保存に失敗: ${error.message}`));
    }
  }

  /**
   * Add reply to history
   */
  addToHistory(entry) {
    this.replyHistory.push({
      ...entry,
      timestamp: new Date().toISOString()
    });
    // Keep only last 100 entries
    if (this.replyHistory.length > 100) {
      this.replyHistory = this.replyHistory.slice(-100);
    }
    this.saveHistory();
  }

  /**
   * Get reply history for reporting
   */
  getHistory(limit = 20) {
    return this.replyHistory.slice(-limit).reverse();
  }

  /**
   * Display reply history report
   */
  showReport(limit = 20) {
    const history = this.getHistory(limit);
    
    if (history.length === 0) {
      console.log(chalk.yellow('\n📊 自動応答の履歴がありません\n'));
      return;
    }
    
    console.log(chalk.cyan(`\n📊 自動応答レポート（直近${history.length}件）\n`));
    console.log(chalk.gray('='.repeat(80)));
    
    history.forEach((entry, i) => {
      const time = new Date(entry.timestamp).toLocaleString('ja-JP');
      console.log(chalk.yellow(`\n[${i + 1}] ${time}`));
      console.log(chalk.gray(`チャンネル: ${entry.channelName || entry.channelId}`));
      console.log(chalk.gray(`トリガー: ${entry.triggerUser} さんのメンション`));
      console.log(chalk.white(`元メッセージ: ${entry.triggerText?.substring(0, 100)}${entry.triggerText?.length > 100 ? '...' : ''}`));
      console.log(chalk.green(`返信内容: ${entry.replyText?.substring(0, 200)}${entry.replyText?.length > 200 ? '...' : ''}`));
    });
    
    console.log(chalk.gray('\n' + '='.repeat(80)));
    console.log(chalk.gray(`💡 履歴は ${this.historyFile} に保存されています\n`));
  }

  /**
   * Check if auto-reply is available (API key configured)
   */
  isAvailable() {
    return this.openai !== null;
  }

  /**
   * Toggle auto-reply mode
   */
  toggle() {
    if (!this.isAvailable()) {
      console.log(chalk.yellow('\n⚠️  OPENAI_API_KEY が設定されていません'));
      console.log(chalk.gray('💡 環境変数 OPENAI_API_KEY を設定してください'));
      return false;
    }
    
    this.enabled = !this.enabled;
    
    if (this.enabled) {
      console.log(chalk.green('\n🤖 自動応答モードを有効にしました'));
      console.log(chalk.gray('💡 メンションや直接の呼びかけに自動で返信します'));
      console.log(chalk.gray('💡 /autoall で全メッセージ返信モードに切り替え'));
    } else {
      this.replyAllMode = false; // Disable reply-all when turning off
      console.log(chalk.yellow('\n🤖 自動応答モードを無効にしました'));
    }
    
    return this.enabled;
  }

  /**
   * Toggle reply-all mode (respond to ALL messages, not just mentions)
   */
  toggleReplyAll() {
    if (!this.isAvailable()) {
      console.log(chalk.yellow('\n⚠️  OPENAI_API_KEY が設定されていません'));
      return false;
    }
    
    if (!this.enabled) {
      // Enable auto-reply first
      this.enabled = true;
    }
    
    this.replyAllMode = !this.replyAllMode;
    
    if (this.replyAllMode) {
      console.log(chalk.bgRed.white.bold('\n🔥 全メッセージ返信モードを有効にしました'));
      console.log(chalk.red('⚠️  全ての新着メッセージに自動で返信します！'));
      console.log(chalk.gray('💡 /autoall で通常モードに戻す'));
    } else {
      console.log(chalk.green('\n🤖 通常の自動応答モードに戻りました'));
      console.log(chalk.gray('💡 メンションや1対1スレッドにのみ返信します'));
    }
    
    return this.replyAllMode;
  }

  /**
   * Check if a message should trigger auto-reply
   */
  shouldRespond(message, allMessages = [], isThreadMode = false) {
    // Skip if auto-reply is disabled
    if (!this.enabled) {
      if (process.env.DEBUG_AUTO) console.error('[DEBUG_AUTO] shouldRespond: disabled');
      return false;
    }
    
    // Skip if already processed
    if (this.processedMessages.has(message.ts)) {
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: already processed ${message.ts}`);
      return false;
    }
    
    // Skip own messages (prevent infinite loop)
    // DEBUG_AUTO_ALLOW_SELF=1 で自分の投稿もテスト可能（デバッグ用）
    if (message.user === this.currentUserId && !process.env.DEBUG_AUTO_ALLOW_SELF) {
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: own message (user=${message.user}, currentUserId=${this.currentUserId})`);
      return false;
    }
    
    // Skip bot messages
    if (message.bot_id || message.subtype === 'bot_message') {
      if (process.env.DEBUG_AUTO) console.error('[DEBUG_AUTO] shouldRespond: bot message');
      return false;
    }
    
    // Reply-all mode: respond to ALL messages (except own and bot)
    if (this.replyAllMode) {
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: MATCH! replyAllMode is ON`);
      return true;
    }
    
    // Use rawText (original Slack format) for mention detection
    // rawText contains <@USER_ID> format, text is already formatted to @username
    const text = message.rawText || message.text || '';
    
    // Check for direct mention
    if (text.includes(`<@${this.currentUserId}>`)) {
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: MATCH! mention found in "${text}"`);
      return true;
    }
    
    // Check if this is a 1-on-1 thread (only 2 participants: me and someone else)
    // Only apply this logic when in thread mode
    if (isThreadMode && allMessages.length > 0) {
      const uniqueUsers = new Set(allMessages.map(m => m.user).filter(u => u));
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: isThreadMode=${isThreadMode}, uniqueUsers=${[...uniqueUsers].join(',')}, size=${uniqueUsers.size}`);
      
      // If only 2 participants and I'm one of them, it's likely directed at me
      if (uniqueUsers.size === 2 && uniqueUsers.has(this.currentUserId)) {
        if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: MATCH! 1-on-1 thread detected`);
        return true;
      }
    }
    
    if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] shouldRespond: no match (isThreadMode=${isThreadMode}, looking for <@${this.currentUserId}>) in "${text}"`);
    return false;
  }

  /**
   * Process new messages and auto-reply if needed
   * @param {boolean} isThreadMode - Whether we're in a thread context
   */
  async processMessages(messages, channelId, threadTs = null, allMessages = [], isThreadMode = false) {
    if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] processMessages called: enabled=${this.enabled}, openai=${!!this.openai}, messages=${messages.length}, allMessages=${allMessages.length}, isThreadMode=${isThreadMode}`);
    
    if (!this.enabled || !this.openai) return;
    
    for (const message of messages) {
      if (process.env.DEBUG_AUTO) console.error(`[DEBUG_AUTO] checking message: ts=${message.ts}, user=${message.user}, text="${(message.text || '').substring(0, 50)}..."`);
      
      if (this.shouldRespond(message, allMessages, isThreadMode)) {
        // Mark as processed immediately to prevent duplicate responses
        this.processedMessages.add(message.ts);
        
        try {
          await this.generateAndSendReply(message, allMessages.length > 0 ? allMessages : messages, channelId, threadTs);
        } catch (error) {
          console.error(chalk.red(`\n❌ 自動応答エラー: ${error.message}`));
        }
      }
    }
    
    // Cleanup old processed messages (keep last 100)
    if (this.processedMessages.size > 100) {
      const oldMessages = [...this.processedMessages].slice(0, this.processedMessages.size - 100);
      oldMessages.forEach(ts => this.processedMessages.delete(ts));
    }
  }

  /**
   * Generate and send auto-reply
   */
  async generateAndSendReply(triggerMessage, contextMessages, channelId, threadTs) {
    console.log(chalk.cyan('\n🤖 自動応答を生成中...'));
    
    // Build context from recent messages
    const context = this.buildContext(contextMessages, triggerMessage);
    
    // Generate reply using OpenAI
    const reply = await this.generateReply(context, triggerMessage);
    
    if (reply) {
      // Determine where to send the reply
      const replyThreadTs = threadTs || triggerMessage.thread_ts || triggerMessage.ts;
      
      // Add mention to the trigger user at the beginning of the reply
      // Skip mention in reply-all mode (too noisy)
      let finalReply = reply;
      if (!this.replyAllMode) {
        const triggerUserId = triggerMessage.user;
        if (triggerUserId) {
          finalReply = `<@${triggerUserId}> ${reply}`;
        }
      }
      
      // Send the reply
      await this.slackClient.sendMessage(channelId, finalReply, replyThreadTs);
      
      console.log(chalk.green('✅ 自動応答を送信しました'));
      console.log(chalk.gray(`💬 ${finalReply.substring(0, 50)}${finalReply.length > 50 ? '...' : ''}`));
      
      // Add to history for reporting
      this.addToHistory({
        channelId,
        channelName: triggerMessage.channelName || channelId,
        threadTs: replyThreadTs,
        triggerUser: triggerMessage.userName || triggerMessage.user,
        triggerText: triggerMessage.text,
        replyText: finalReply
      });
    }
  }

  /**
   * Build context string from messages
   */
  buildContext(messages, triggerMessage) {
    // Get last N messages for context
    const recentMessages = messages.slice(-this.maxContextMessages);
    
    let context = '以下はSlackのスレッドの会話履歴です。最後のメッセージに対して適切な返信を生成してください。\n\n';
    context += '---会話履歴---\n';
    
    for (const msg of recentMessages) {
      const userName = msg.userName || msg.user || 'Unknown';
      const text = this.stripMentions(msg.text || '');
      const isMe = msg.user === this.currentUserId ? ' (あなた)' : '';
      context += `${userName}${isMe}: ${text}\n`;
    }
    
    context += '---\n\n';
    // 基本ルールのみ。絵文字等のスタイルはsystemPrompt（ペルソナ）で制御
    context += '返信のルール:\n';
    context += '- 自然な日本語で返信してください\n';
    context += '- 文脈を理解した上で適切に返信してください\n';
    context += '- 必要に応じて質問に答えたり、情報を提供してください\n';
    context += '- 簡潔でわかりやすい返信を心がけてください\n';
    
    return context;
  }

  /**
   * Strip Slack mention formatting from text
   */
  stripMentions(text) {
    // Remove <@USER_ID> mentions and replace with display text if available
    return text
      .replace(/<@[A-Z0-9]+>/g, '@someone')
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
      .replace(/<([^|>]+)\|([^>]+)>/g, '$2');
  }

  /**
   * Generate reply using OpenAI
   */
  async generateReply(context, triggerMessage) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      
      // カスタムプロンプトは環境変数または設定ファイルから取得可能
      const customPersona = process.env.AUTO_REPLY_PERSONA || '';
      
      let systemPrompt = 'あなたはSlackで会話に参加しているチームメンバーです。';
      
      if (customPersona) {
        systemPrompt += `\n\n以下の文体・キャラクター設定に従って返信してください：\n${customPersona}`;
      } else {
        // デフォルトの文体設定
        systemPrompt += `
以下の文体で返信してください：
- フレンドリーでカジュアルな口調
- 「〜だね」「〜かな」「〜だよ」などの語尾
- 絵文字を適度に使用（:thumbsup: :smile: など）
- 長すぎず、要点を押さえた返信
- 技術的な質問には具体的に回答
- わからないことは正直に「ちょっとわからないな」と言う`;
      }
      
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: context
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content?.trim() || null;
    } catch (error) {
      if (error.code === 'insufficient_quota') {
        console.error(chalk.red('❌ OpenAI APIのクォータが不足しています'));
      } else if (error.code === 'invalid_api_key') {
        console.error(chalk.red('❌ OpenAI APIキーが無効です'));
      } else {
        throw error;
      }
      return null;
    }
  }

  /**
   * Get status string
   */
  getStatus() {
    if (!this.isAvailable()) {
      return chalk.gray('🤖 自動応答: 利用不可 (API未設定)');
    }
    return this.enabled 
      ? chalk.green('🤖 自動応答: 有効')
      : chalk.gray('🤖 自動応答: 無効');
  }
}

module.exports = AutoReply;
