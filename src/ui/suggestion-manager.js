/**
 * Suggestion Manager
 * Manages autocomplete suggestions for mentions, channels, and commands
 */

const { API } = require('../utils/constants');

class SuggestionManager {
  constructor(slackClient, contextType = 'channel', channelId = null) {
    this.slackClient = slackClient;
    this.contextType = contextType;
    this.channelId = channelId; // Current channel ID for channel-specific user search
    this.suggestions = [];
    this.selectedIndex = -1;
    this.suggestionType = null; // 'mention', 'channel', or 'command'
    this.lastChannelQuery = null;
    this.lastMentionQuery = null;
    this.isLoadingChannels = false;
    this.isLoadingMentions = false;
  }

  /**
   * Load channel suggestions
   */
  async loadChannelSuggestions(searchTerm) {
    if (!this.slackClient) return [];
    
    // Prevent duplicate concurrent loads
    if (this.isLoadingChannels && this.lastChannelQuery === searchTerm) {
      return this.suggestions;
    }

    this.isLoadingChannels = true;
    this.lastChannelQuery = searchTerm;

    try {
      const channels = await this.slackClient.searchChannels(searchTerm, API.MENTION_SEARCH_LIMIT);
      const mappedSuggestions = channels.map(ch => ({
        value: ch.name,
        display: `#${ch.name}`,
        channel: ch,
        type: 'channel'
      }));

      this.isLoadingChannels = false;
      return mappedSuggestions;
    } catch (error) {
      this.isLoadingChannels = false;
      return [];
    }
  }

  /**
   * Load mention suggestions
   */
  async loadMentionSuggestions(searchTerm) {
    if (!this.slackClient) return [];

    // Prevent duplicate concurrent loads
    if (this.isLoadingMentions && this.lastMentionQuery === searchTerm) {
      return this.suggestions;
    }

    this.isLoadingMentions = true;
    this.lastMentionQuery = searchTerm;

    try {
      const mentions = await this.slackClient.searchMentions(searchTerm, API.MENTION_SEARCH_LIMIT, this.channelId);
      const mappedSuggestions = mentions.map(m => ({
        value: m.name || m.id,
        display: m.type === 'special' 
          ? `${m.name} (${m.display_name})`
          : `@${m.name} (${m.display_name})`,
        type: 'mention'
      }));

      this.isLoadingMentions = false;
      return mappedSuggestions;
    } catch (error) {
      this.isLoadingMentions = false;
      return [];
    }
  }

  /**
   * Find mention context (@word)
   */
  findMentionContext(input, cursorPos) {
    const beforeCursor = input.substring(0, cursorPos);
    const match = beforeCursor.match(/@([a-zA-Z0-9_-]*)$/);
    
    if (match) {
      return {
        type: 'mention',
        searchTerm: match[1],
        startPos: beforeCursor.length - match[0].length,
        fullMatch: match[0]
      };
    }
    
    return null;
  }

  /**
   * Find channel context (#word)
   */
  findChannelContext(input, cursorPos) {
    const beforeCursor = input.substring(0, cursorPos);
    const match = beforeCursor.match(/#([a-zA-Z0-9_-]*)$/);
    
    if (match) {
      return {
        type: 'channel',
        searchTerm: match[1],
        startPos: beforeCursor.length - match[0].length,
        fullMatch: match[0]
      };
    }
    
    return null;
  }

  /**
   * Get available commands based on context
   */
  getAvailableCommands(contextType) {
    if (contextType === 'selection') {
      // Channel selection screen
      return [
        { command: '/<番号>', description: '履歴から選択（例: /1）' },
        { command: '/delete', description: '履歴から削除（例: /delete 1 3 5）', alias: '/del' },
        { command: '/clear', description: '履歴キャッシュをクリア' }
      ];
    } else if (contextType === 'thread') {
      // Thread context
      return [
        { command: '/back', description: 'チャンネルに戻る', alias: '/b' },
        { command: '/more', description: 'さらに30件の過去メッセージを表示', alias: '/m' },
        { command: '/recent', description: '今日の会話履歴から選択', alias: '/r' },
        { command: '/delete', description: '/recentモード中に履歴削除（例: /delete 1 3 5）', alias: '/del' },
        { command: '/cancel', description: '履歴選択モードを解除', alias: '/c' },
        { command: '/refresh', description: '今日の投稿を検索して履歴に追加', alias: '/sync' },
        { command: '/reload', description: 'メッセージを再取得', alias: '/rl' },
        { command: '/clear', description: '履歴キャッシュをクリア' },
        { command: '/w', description: 'ブラウザで開く', alias: '/web' },
        { command: '/link', description: 'リンクを表示', alias: '/link [番号]' },
        { command: '/edit', description: 'メッセージを編集（例: /edit 5）' },
        { command: '/rm', description: 'メッセージを削除（例: /rm 1 3 5）' },
        { command: '/auto', description: '自動応答モードの切り替え' },
        { command: '/exit', description: 'チャット終了', alias: '/quit, /q' },
        { command: '/help', description: 'ヘルプを表示' }
      ];
    } else {
      // Channel context
      return [
        { command: '/<番号>', description: 'スレッドに入る（例: /3）' },
        { command: '/prev', description: '前日の履歴を表示', alias: '/p' },
        { command: '/next', description: '次の日の履歴を表示', alias: '/n' },
        { command: '/today', description: '今日の履歴に戻る' },
        { command: '/history', description: '過去の履歴を表示', alias: '/h [件数]' },
        { command: '/recent', description: '今日の会話履歴から選択', alias: '/r' },
        { command: '/delete', description: '/recentモード中に履歴削除（例: /delete 1 3 5）', alias: '/del' },
        { command: '/cancel', description: '履歴選択モードを解除', alias: '/c' },
        { command: '/refresh', description: '今日の投稿を検索して履歴に追加', alias: '/sync' },
        { command: '/reload', description: 'メッセージを再取得', alias: '/rl' },
        { command: '/clear', description: '履歴キャッシュをクリア' },
        { command: '/w', description: 'ブラウザで開く', alias: '/web' },
        { command: '/link', description: 'リンクを表示', alias: '/link [番号]' },
        { command: '/edit', description: 'メッセージを編集（例: /edit 5）' },
        { command: '/rm', description: 'メッセージを削除（例: /rm 1 3 5）' },
        { command: '/auto', description: '自動応答モードの切り替え' },
        { command: '/exit', description: 'チャット終了', alias: '/quit, /q' },
        { command: '/help', description: 'ヘルプを表示' }
      ];
    }
  }

  /**
   * Find command context (/word)
   */
  findCommandContext(input, cursorPos) {
    const beforeCursor = input.substring(0, cursorPos);
    
    // Only match if at start of line
    if (beforeCursor.trim().startsWith('/')) {
      const match = beforeCursor.match(/^\/([a-zA-Z]*)$/);
      
      if (match) {
        return {
          type: 'command',
          searchTerm: match[1],
          startPos: 0,
          fullMatch: match[0]
        };
      }
    }
    
    return null;
  }

  /**
   * Load command suggestions
   */
  loadCommandSuggestions(searchTerm) {
    const commands = this.getAvailableCommands(this.contextType);
    const lowerQuery = searchTerm.toLowerCase();

    return commands
      .filter(cmd => {
        const mainMatch = cmd.command.toLowerCase().includes(lowerQuery);
        const aliasMatch = cmd.alias && cmd.alias.toLowerCase().includes(lowerQuery);
        return mainMatch || aliasMatch;
      })
      .map(cmd => ({
        value: cmd.command.split(' ')[0], // Just the command part
        display: cmd.alias 
          ? `${cmd.command} (${cmd.alias}) - ${cmd.description}`
          : `${cmd.command} - ${cmd.description}`,
        type: 'command'
      }));
  }

  /**
   * Update suggestions based on current input
   */
  async updateSuggestions(input, cursorPos, autoChannelMode) {
    // Check for command context (always first)
    const commandContext = this.findCommandContext(input, cursorPos);
    if (commandContext) {
      this.suggestions = this.loadCommandSuggestions(commandContext.searchTerm);
      this.suggestionType = 'command';
      this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;
      return;
    }

    // Check for channel context
    const channelContext = this.findChannelContext(input, cursorPos);
    if (channelContext || autoChannelMode) {
      const searchTerm = channelContext ? channelContext.searchTerm : input.trim();
      this.suggestions = await this.loadChannelSuggestions(searchTerm);
      this.suggestionType = 'channel';
      this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;
      return;
    }

    // Check for mention context
    const mentionContext = this.findMentionContext(input, cursorPos);
    if (mentionContext) {
      this.suggestions = await this.loadMentionSuggestions(mentionContext.searchTerm);
      this.suggestionType = 'mention';
      this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;
      return;
    }

    // No context found
    this.clearSuggestions();
  }

  /**
   * Clear all suggestions
   */
  clearSuggestions() {
    this.suggestions = [];
    this.selectedIndex = -1;
    this.suggestionType = null;
  }

  /**
   * Move selection up
   */
  moveSelectionUp() {
    if (this.suggestions.length === 0) return;
    
    this.selectedIndex--;
    if (this.selectedIndex < 0) {
      this.selectedIndex = this.suggestions.length - 1;
    }
  }

  /**
   * Move selection down
   */
  moveSelectionDown() {
    if (this.suggestions.length === 0) return;
    
    this.selectedIndex++;
    if (this.selectedIndex >= this.suggestions.length) {
      this.selectedIndex = 0;
    }
  }

  /**
   * Get selected suggestion
   */
  getSelectedSuggestion() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
      return this.suggestions[this.selectedIndex];
    }
    return null;
  }

  /**
   * Check if suggestions are visible
   */
  hasSuggestions() {
    return this.suggestions.length > 0;
  }
}

module.exports = SuggestionManager;
