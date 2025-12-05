/**
 * Auto Reply Module
 * Automatically responds to mentions and direct messages using OpenAI
 */

const OpenAI = require('openai');
const chalk = require('chalk');

class AutoReply {
  constructor(slackClient, currentUserId) {
    this.slackClient = slackClient;
    this.currentUserId = currentUserId;
    this.enabled = false;
    this.openai = null;
    this.processedMessages = new Set(); // Track already processed message timestamps
    this.maxContextMessages = 20; // Maximum number of context messages to include
    
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
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
    } else {
      console.log(chalk.yellow('\n🤖 自動応答モードを無効にしました'));
    }
    
    return this.enabled;
  }

  /**
   * Check if a message should trigger auto-reply
   */
  shouldRespond(message) {
    // Skip if auto-reply is disabled
    if (!this.enabled) return false;
    
    // Skip if already processed
    if (this.processedMessages.has(message.ts)) return false;
    
    // Skip own messages (prevent infinite loop)
    if (message.user === this.currentUserId) return false;
    
    // Skip bot messages
    if (message.bot_id || message.subtype === 'bot_message') return false;
    
    const text = message.text || '';
    
    // Check for direct mention
    if (text.includes(`<@${this.currentUserId}>`)) {
      return true;
    }
    
    return false;
  }

  /**
   * Process new messages and auto-reply if needed
   */
  async processMessages(messages, channelId, threadTs = null) {
    if (!this.enabled || !this.openai) return;
    
    for (const message of messages) {
      if (this.shouldRespond(message)) {
        // Mark as processed immediately to prevent duplicate responses
        this.processedMessages.add(message.ts);
        
        try {
          await this.generateAndSendReply(message, messages, channelId, threadTs);
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
      
      // Send the reply
      await this.slackClient.sendMessage(channelId, reply, replyThreadTs);
      
      console.log(chalk.green('✅ 自動応答を送信しました'));
      console.log(chalk.gray(`💬 ${reply.substring(0, 50)}${reply.length > 50 ? '...' : ''}`));
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
    context += '返信のルール:\n';
    context += '- 自然な日本語で返信してください\n';
    context += '- 文脈を理解した上で適切に返信してください\n';
    context += '- 必要に応じて質問に答えたり、情報を提供してください\n';
    context += '- 簡潔でわかりやすい返信を心がけてください\n';
    context += '- Slackの絵文字（:emoji:形式）を適度に使用してOKです\n';
    
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
      
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'あなたはSlackで会話に参加しているチームメンバーです。自然で親しみやすい返信を心がけてください。返信は簡潔に、でも必要な情報は含めてください。'
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
