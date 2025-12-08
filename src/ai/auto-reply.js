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
    
    // Writing style files
    this.configDir = path.join(os.homedir(), '.config', 'slack-cli');
    this.defaultStyleFile = path.join(this.configDir, 'writing-style-default.json');
    this.threadStyleFile = path.join(this.configDir, 'writing-style-threads.json');
    
    // Writing style cache
    this.defaultStyle = null;
    this.threadStyles = {}; // { threadKey: { style, analyzedAt, sampleCount } }
    
    // Initialize OpenAI client if API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    
    // Load existing history and styles
    this.loadHistory();
    this.loadWritingStyles();
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
   * Load writing styles from files
   */
  loadWritingStyles() {
    try {
      // Load default style
      if (fs.existsSync(this.defaultStyleFile)) {
        const data = fs.readFileSync(this.defaultStyleFile, 'utf-8');
        this.defaultStyle = JSON.parse(data);
      }
      
      // Load thread styles
      if (fs.existsSync(this.threadStyleFile)) {
        const data = fs.readFileSync(this.threadStyleFile, 'utf-8');
        this.threadStyles = JSON.parse(data);
      }
    } catch (error) {
      // Ignore errors, start with empty styles
      if (process.env.DEBUG_AUTO) {
        console.error(`[DEBUG_AUTO] loadWritingStyles error: ${error.message}`);
      }
    }
  }

  /**
   * Save writing styles to files
   */
  saveWritingStyles() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      
      // Save default style
      if (this.defaultStyle) {
        fs.writeFileSync(this.defaultStyleFile, JSON.stringify(this.defaultStyle, null, 2));
      }
      
      // Save thread styles (keep last 100 threads)
      const threadKeys = Object.keys(this.threadStyles);
      if (threadKeys.length > 100) {
        // Sort by analyzedAt and keep newest 100
        const sorted = threadKeys.sort((a, b) => 
          new Date(this.threadStyles[b].analyzedAt) - new Date(this.threadStyles[a].analyzedAt)
        );
        const toKeep = sorted.slice(0, 100);
        const newStyles = {};
        toKeep.forEach(key => { newStyles[key] = this.threadStyles[key]; });
        this.threadStyles = newStyles;
      }
      fs.writeFileSync(this.threadStyleFile, JSON.stringify(this.threadStyles, null, 2));
    } catch (error) {
      console.error(chalk.red(`文体スタイルの保存に失敗: ${error.message}`));
    }
  }

  /**
   * Generate thread key for style lookup
   */
  getThreadKey(channelId, threadTs) {
    return threadTs ? `${channelId}:${threadTs}` : channelId;
  }

  /**
   * Extract my messages from a conversation
   */
  extractMyMessages(messages) {
    return messages.filter(msg => msg.user === this.currentUserId && msg.text);
  }

  /**
   * Analyze writing style from messages using OpenAI
   */
  async analyzeWritingStyle(myMessages) {
    if (!this.openai || myMessages.length === 0) {
      return null;
    }

    const sampleTexts = myMessages
      .map(msg => this.stripMentions(msg.text || ''))
      .filter(text => text.length > 10) // Skip very short messages
      .slice(-10); // Use last 10 substantial messages

    if (sampleTexts.length < 2) {
      return null; // Need at least 2 messages to analyze
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    try {
      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: `あなたは文章スタイル分析の専門家です。与えられたSlackメッセージのサンプルから、書き手の文体の特徴を分析してJSON形式で出力してください。

出力形式（必ずこの形式で）:
{
  "formality": "casual" | "polite" | "formal",
  "endings": ["〜です", "〜ね", "〜だよ"],
  "characteristics": ["論理的な構造化", "番号付けを使う", "断定的"],
  "connectors": ["まあ、", "いや、", "とは言え"],
  "emoji_usage": "none" | "minimal" | "moderate" | "frequent",
  "tone": "friendly" | "professional" | "direct",
  "sample_phrases": ["〜してもらいたいです", "〜ですね〜"]
}`
          },
          {
            role: 'user',
            content: `以下のSlackメッセージから文体の特徴を分析してください：\n\n${sampleTexts.join('\n\n---\n\n')}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) return null;

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = content;
      if (content.includes('```')) {
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonStr = match[1].trim();
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      if (process.env.DEBUG_AUTO) {
        console.error(`[DEBUG_AUTO] analyzeWritingStyle error: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get or analyze writing style for a thread
   * Returns the style to use for generating replies
   * Uses default style as base and merges thread-specific rules
   */
  async getWritingStyle(messages, channelId, threadTs) {
    const threadKey = this.getThreadKey(channelId, threadTs);
    const myMessages = this.extractMyMessages(messages);

    // Check if we have cached style for this thread and if we need to re-analyze
    const cachedStyle = this.threadStyles[threadKey];
    const needsReanalysis = !cachedStyle || myMessages.length > cachedStyle.sampleCount;

    // Analyze if we have my messages in this thread and need update
    if (myMessages.length >= 2 && needsReanalysis) {
      console.log(chalk.gray('🔍 文体を解析中...'));
      const threadStyle = await this.analyzeWritingStyle(myMessages);
      
      if (threadStyle) {
        // Cache the style for this thread
        this.threadStyles[threadKey] = {
          style: threadStyle,
          analyzedAt: new Date().toISOString(),
          sampleCount: myMessages.length
        };
        this.saveWritingStyles();

        // Also update default style with weighted merge
        await this.updateDefaultStyle(threadStyle);

        if (process.env.DEBUG_AUTO) {
          console.error(`[DEBUG_AUTO] Analyzed and cached style for ${threadKey}`);
        }

        // Merge default style with thread-specific rules
        // Default style is base, thread style overrides/supplements
        if (this.defaultStyle) {
          return this.mergeStyles(this.defaultStyle, threadStyle);
        }
        return threadStyle;
      }
    }

    // Use cached thread style merged with default
    if (cachedStyle && this.defaultStyle) {
      if (process.env.DEBUG_AUTO) {
        console.error(`[DEBUG_AUTO] Using merged style for ${threadKey}`);
      }
      return this.mergeStyles(this.defaultStyle, cachedStyle.style);
    }

    // Use cached thread style if no default
    if (cachedStyle) {
      if (process.env.DEBUG_AUTO) {
        console.error(`[DEBUG_AUTO] Using cached thread style for ${threadKey}`);
      }
      return cachedStyle.style;
    }

    // Fall back to default style
    if (this.defaultStyle) {
      if (process.env.DEBUG_AUTO) {
        console.error(`[DEBUG_AUTO] Using default style`);
      }
      return this.defaultStyle;
    }

    // No style available
    return null;
  }

  /**
   * Merge default style with thread-specific style
   * Default is the base, thread style supplements/overrides
   */
  mergeStyles(defaultStyle, threadStyle) {
    const mergeArrays = (base, override) => {
      if (!base && !override) return [];
      if (!base) return override || [];
      if (!override) return base;
      // Thread-specific items come first (higher priority)
      const combined = [...new Set([...override, ...base])];
      return combined.slice(0, 10);
    };

    return {
      formality: threadStyle.formality || defaultStyle.formality,
      endings: mergeArrays(defaultStyle.endings, threadStyle.endings),
      characteristics: mergeArrays(defaultStyle.characteristics, threadStyle.characteristics),
      connectors: mergeArrays(defaultStyle.connectors, threadStyle.connectors),
      emoji_usage: threadStyle.emoji_usage || defaultStyle.emoji_usage,
      tone: threadStyle.tone || defaultStyle.tone,
      sample_phrases: mergeArrays(defaultStyle.sample_phrases, threadStyle.sample_phrases),
    };
  }

  /**
   * Update default style by merging with new analysis
   */
  async updateDefaultStyle(newStyle) {
    if (!this.defaultStyle) {
      // First time: just use the new style
      this.defaultStyle = {
        ...newStyle,
        sampleCount: 1,
        lastUpdated: new Date().toISOString()
      };
      this.saveWritingStyles();
      return;
    }

    // Merge arrays (take unique values, prefer recent)
    const mergeArrays = (existing, incoming) => {
      if (!existing) return incoming || [];
      if (!incoming) return existing;
      const combined = [...new Set([...incoming, ...existing])];
      return combined.slice(0, 10); // Keep top 10
    };

    // Update with weighted preference to newer data
    this.defaultStyle = {
      formality: newStyle.formality || this.defaultStyle.formality,
      endings: mergeArrays(this.defaultStyle.endings, newStyle.endings),
      characteristics: mergeArrays(this.defaultStyle.characteristics, newStyle.characteristics),
      connectors: mergeArrays(this.defaultStyle.connectors, newStyle.connectors),
      emoji_usage: newStyle.emoji_usage || this.defaultStyle.emoji_usage,
      tone: newStyle.tone || this.defaultStyle.tone,
      sample_phrases: mergeArrays(this.defaultStyle.sample_phrases, newStyle.sample_phrases),
      sampleCount: (this.defaultStyle.sampleCount || 0) + 1,
      lastUpdated: new Date().toISOString()
    };

    this.saveWritingStyles();
    
    if (process.env.DEBUG_AUTO) {
      console.error(`[DEBUG_AUTO] Updated default style, sampleCount: ${this.defaultStyle.sampleCount}`);
    }
  }

  /**
   * Convert writing style to prompt text
   */
  styleToPrompt(style) {
    if (!style) return null;

    let prompt = '';
    
    // Formality
    switch (style.formality) {
      case 'casual':
        prompt += '- カジュアルでタメ口調で返信\n';
        break;
      case 'polite':
        prompt += '- 丁寧語を使いつつも親しみやすい口調\n';
        break;
      case 'formal':
        prompt += '- フォーマルで敬語を使った丁寧な返信\n';
        break;
    }

    // Tone
    switch (style.tone) {
      case 'friendly':
        prompt += '- フレンドリーで温かみのあるトーン\n';
        break;
      case 'professional':
        prompt += '- プロフェッショナルなトーン\n';
        break;
      case 'direct':
        prompt += '- 直接的で簡潔なトーン\n';
        break;
    }

    // Endings
    if (style.endings && style.endings.length > 0) {
      prompt += `- 語尾のパターン: ${style.endings.slice(0, 5).join('、')}\n`;
    }

    // Characteristics
    if (style.characteristics && style.characteristics.length > 0) {
      prompt += `- 文章の特徴: ${style.characteristics.slice(0, 5).join('、')}\n`;
    }

    // Connectors
    if (style.connectors && style.connectors.length > 0) {
      prompt += `- よく使う接続詞・前置き: ${style.connectors.slice(0, 5).join('、')}\n`;
    }

    // Emoji usage
    switch (style.emoji_usage) {
      case 'none':
        prompt += '- 絵文字は使わない\n';
        break;
      case 'minimal':
        prompt += '- 絵文字は最小限に\n';
        break;
      case 'moderate':
        prompt += '- 絵文字を適度に使用\n';
        break;
      case 'frequent':
        prompt += '- 絵文字を頻繁に使用\n';
        break;
    }

    // Sample phrases
    if (style.sample_phrases && style.sample_phrases.length > 0) {
      prompt += `- 参考フレーズ: 「${style.sample_phrases.slice(0, 3).join('」「')}」\n`;
    }

    return prompt;
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
   * @param {Array} contextMessages - Current thread/channel messages for style learning
   * @param {string} channelId - Channel ID for style caching
   * @param {string} threadTs - Thread timestamp for style caching
   */
  async toggle(contextMessages = [], channelId = null, threadTs = null) {
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
      
      // Start learning writing style immediately if we have context
      if (contextMessages.length > 0 && channelId) {
        await this.learnWritingStyleOnEnable(contextMessages, channelId, threadTs);
      }
    } else {
      this.replyAllMode = false; // Disable reply-all when turning off
      console.log(chalk.yellow('\n🤖 自動応答モードを無効にしました'));
    }
    
    return this.enabled;
  }

  /**
   * Learn writing style when auto-reply is enabled
   */
  async learnWritingStyleOnEnable(messages, channelId, threadTs) {
    const myMessages = this.extractMyMessages(messages);
    
    if (myMessages.length < 2) {
      console.log(chalk.gray('📝 このスレッドの自分の投稿が少ないため、デフォルト文体を使用します'));
      if (this.defaultStyle) {
        console.log(chalk.gray(`   (学習済みデフォルト文体: ${this.defaultStyle.formality || 'unknown'})`));
      }
      return;
    }

    console.log(chalk.cyan('📝 文体を学習中...'));
    
    const style = await this.analyzeWritingStyle(myMessages);
    
    if (style) {
      const threadKey = this.getThreadKey(channelId, threadTs);
      
      // Cache the style for this thread
      this.threadStyles[threadKey] = {
        style,
        analyzedAt: new Date().toISOString(),
        sampleCount: myMessages.length
      };
      this.saveWritingStyles();

      // Also update default style
      await this.updateDefaultStyle(style);

      console.log(chalk.green('✅ 文体を学習しました'));
      console.log(chalk.gray(`   - トーン: ${style.formality || 'unknown'}`));
      console.log(chalk.gray(`   - 語尾: ${(style.endings || []).slice(0, 3).join('、') || 'なし'}`));
      console.log(chalk.gray(`   - 絵文字: ${style.emoji_usage || 'unknown'}`));
    }
  }

  /**
   * Toggle reply-all mode (respond to ALL messages, not just mentions)
   * @param {Array} contextMessages - Current thread/channel messages for style learning
   * @param {string} channelId - Channel ID for style caching
   * @param {string} threadTs - Thread timestamp for style caching
   */
  async toggleReplyAll(contextMessages = [], channelId = null, threadTs = null) {
    if (!this.isAvailable()) {
      console.log(chalk.yellow('\n⚠️  OPENAI_API_KEY が設定されていません'));
      return false;
    }
    
    const wasDisabled = !this.enabled;
    
    if (!this.enabled) {
      // Enable auto-reply first
      this.enabled = true;
    }
    
    this.replyAllMode = !this.replyAllMode;
    
    if (this.replyAllMode) {
      console.log(chalk.bgRed.white.bold('\n🔥 全メッセージ返信モードを有効にしました'));
      console.log(chalk.red('⚠️  全ての新着メッセージに自動で返信します！'));
      console.log(chalk.gray('💡 /autoall で通常モードに戻す'));
      
      // Start learning writing style immediately if we just enabled
      if (wasDisabled && contextMessages.length > 0 && channelId) {
        await this.learnWritingStyleOnEnable(contextMessages, channelId, threadTs);
      }
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
    
    // Get or analyze writing style for this thread
    const style = await this.getWritingStyle(contextMessages, channelId, threadTs);
    
    // Build context from recent messages
    const context = this.buildContext(contextMessages, triggerMessage);
    
    // Generate reply using OpenAI with writing style
    const reply = await this.generateReply(context, triggerMessage, style);
    
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
    context += '- 自分の名前を名乗らないでください（「〇〇です」のような自己紹介は不要）\n';
    
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
  async generateReply(context, triggerMessage, writingStyle = null) {
    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      
      // カスタムプロンプトは環境変数または設定ファイルから取得可能
      const customPersona = process.env.AUTO_REPLY_PERSONA || '';
      
      let systemPrompt = 'あなたはSlackで会話に参加しているチームメンバーです。';
      
      if (customPersona) {
        // 環境変数で明示的に指定された場合は最優先
        systemPrompt += `\n\n以下の文体・キャラクター設定に従って返信してください：\n${customPersona}`;
      } else if (writingStyle) {
        // 解析された文体がある場合はそれを使用
        const stylePrompt = this.styleToPrompt(writingStyle);
        if (stylePrompt) {
          systemPrompt += `\n\n以下の文体で返信してください（この人の過去の投稿から学習した文体です）：\n${stylePrompt}`;
          if (process.env.DEBUG_AUTO) {
            console.error(`[DEBUG_AUTO] Using analyzed writing style:\n${stylePrompt}`);
          }
        }
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

  /**
   * Show current writing style info
   */
  showStyleInfo(channelId, threadTs) {
    const threadKey = this.getThreadKey(channelId, threadTs);
    
    console.log(chalk.cyan('\n📝 文体スタイル情報\n'));
    
    // Thread style
    const threadStyle = this.threadStyles[threadKey];
    if (threadStyle) {
      console.log(chalk.yellow('🧵 このスレッドの文体:'));
      console.log(chalk.gray(`   解析日時: ${new Date(threadStyle.analyzedAt).toLocaleString('ja-JP')}`));
      console.log(chalk.gray(`   サンプル数: ${threadStyle.sampleCount}件`));
      const prompt = this.styleToPrompt(threadStyle.style);
      if (prompt) {
        console.log(chalk.white(prompt.split('\n').map(l => '   ' + l).join('\n')));
      }
    } else {
      console.log(chalk.gray('🧵 このスレッドの文体: 未解析'));
    }
    
    console.log('');
    
    // Default style
    if (this.defaultStyle) {
      console.log(chalk.yellow('📌 デフォルト文体:'));
      console.log(chalk.gray(`   更新日時: ${new Date(this.defaultStyle.lastUpdated).toLocaleString('ja-JP')}`));
      console.log(chalk.gray(`   学習回数: ${this.defaultStyle.sampleCount}回`));
      const prompt = this.styleToPrompt(this.defaultStyle);
      if (prompt) {
        console.log(chalk.white(prompt.split('\n').map(l => '   ' + l).join('\n')));
      }
    } else {
      console.log(chalk.gray('📌 デフォルト文体: 未学習'));
      console.log(chalk.gray('   💡 /auto を有効にして返信すると自動で学習します'));
    }
    
    console.log('');
  }

  /**
   * Clear all writing styles
   */
  clearStyles() {
    this.defaultStyle = null;
    this.threadStyles = {};
    
    try {
      if (fs.existsSync(this.defaultStyleFile)) {
        fs.unlinkSync(this.defaultStyleFile);
      }
      if (fs.existsSync(this.threadStyleFile)) {
        fs.unlinkSync(this.threadStyleFile);
      }
      console.log(chalk.green('\n✅ 文体スタイルをクリアしました\n'));
    } catch (error) {
      console.error(chalk.red(`\n❌ クリアに失敗: ${error.message}\n`));
    }
  }
}

module.exports = AutoReply;
