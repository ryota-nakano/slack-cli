/**
 * Readline Input Mode
 * Interactive input with mention autocomplete
 */

const readline = require('readline');
const chalk = require('chalk');
const stringWidth = require('string-width');
const UserHelper = require('../utils/user-helper');

class ReadlineInput {
  constructor(channelMembers = [], slackClient = null, contextType = 'channel', channelId = null) {
    this.members = channelMembers; // Deprecated - not used anymore
    this.slackClient = slackClient; // SlackClient instance for dynamic search
    this.channelId = channelId; // Current channel ID for channel-specific user search
    this.input = '';
    this.cursorPos = 0;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.suggestionType = null; // 'mention', 'channel', or 'command'
    this.rl = null;
    this.previousLineCount = 1;
    this.screenCursorLine = 0; // Track which line the cursor is actually on screen (0-based)
    this.autoChannelMode = false; // Auto channel selection mode (no # required)
    this.lastChannelQuery = null; // Track last channel query to avoid duplicate searches
    this.lastMentionQuery = null; // Track last mention query to avoid duplicate searches
    this.isLoadingChannels = false; // Prevent concurrent channel loads
    this.isLoadingMentions = false; // Prevent concurrent mention loads
    this.contextType = contextType; // 'channel', 'thread', or 'selection'
  }

  /**
   * Show prompt and wait for input
   * @param {string} contextName - Context name (already formatted with [スレッド] if needed)
   * @param {boolean} autoChannelMode - If true, automatically show channel suggestions on start
   */
  async prompt(contextName, autoChannelMode = false) {
    this.autoChannelMode = autoChannelMode;
    
    return new Promise((resolve) => {
      const label = `💬 #${contextName}`;
      console.log(chalk.cyan(label));
      
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
      });

      // Show initial prompt using redrawInput
      this.redrawInput(); // This will draw "> " with empty input

      // In auto channel mode, show hint but don't auto-trigger
      // Let user start typing to trigger suggestions

      readline.emitKeypressEvents(process.stdin, this.rl);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      const cleanup = () => {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('keypress', onKeypress);
        if (this.rl) {
          this.rl.close();
        }
      };

      const onKeypress = async (str, key) => {
        if (!key) return;

        // Ctrl+C: Exit
        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.exit(0);
        }

        // Ctrl+E: Switch to editor mode
        if (key.ctrl && key.name === 'e') {
          this.clearSuggestions();
          cleanup();
          resolve('__EDITOR__');
          return;
        }

        // Ctrl+R: Execute /recent command
        if (key.ctrl && key.name === 'r') {
          this.clearSuggestions();
          cleanup();
          resolve('/recent');
          return;
        }

        // Ctrl+W: Execute /w command (open in browser)
        if (key.ctrl && key.name === 'w') {
          this.clearSuggestions();
          cleanup();
          resolve('/w');
          return;
        }

        // Ctrl+J: Ignore (prevent newline insertion)
        if (key.ctrl && key.name === 'j') {
          return;
        }

        // Enter: Submit or select suggestion
        if (key.name === 'return') {
          if (this.suggestions.length > 0) {
            const result = this.insertSuggestion();
            this.clearSuggestions();
            this.redrawInput();
            
            // If channel was selected with switch intent, signal special handling
            if (result && result.type === 'channel' && !result.inserted) {
              cleanup();
              resolve({ type: 'channel', channel: result.channel });
              return;
            }
            
            // Don't auto-update after selection
            return;
          }

          this.clearSuggestions();
          cleanup();
          
          if (this.input.trim() === '') {
            resolve('__EMPTY__');
            return;
          }
          
          resolve(this.input);
          return;
        }

        // Arrow keys when suggestions are shown
        if (this.suggestions.length > 0) {
          if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
            this.selectedIndex = this.selectedIndex > 0
              ? this.selectedIndex - 1
              : this.suggestions.length - 1;
            this.redrawSuggestions();
            return;
          }

          if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
            this.selectedIndex = this.selectedIndex < this.suggestions.length - 1
              ? this.selectedIndex + 1
              : 0;
            this.redrawSuggestions();
            return;
          }

          if (key.name === 'tab') {
            const result = this.insertSuggestion();
            this.clearSuggestions();
            this.redrawInput();
            
            // Don't re-trigger suggestions for commands - they're complete after selection
            if (this.suggestionType !== 'command') {
              await this.updateSuggestions();
            }
            return;
          }
        } else if (key.name === 'tab') {
          // Clear any existing suggestions first
          this.clearSuggestions();
          
          // Try channel context first
          const channelResult = this.findChannelContext();
          if (channelResult && channelResult.needsLoad) {
            // Show loading indicator
            process.stdout.write(chalk.gray('\n🔍 検索中...'));
            
            await this.loadChannelSuggestions(channelResult.searchTerm);
            
            // Clear loading indicator
            readline.moveCursor(process.stdout, 0, -1);
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            
            if (this.suggestions.length > 0) {
              this.showSuggestions();
            } else {
              // Show "no results" message temporarily
              process.stdout.write(chalk.yellow('\n💡 該当するチャンネルが見つかりませんでした'));
              setTimeout(() => {
                readline.moveCursor(process.stdout, 0, -1);
                readline.cursorTo(process.stdout, 0);
                readline.clearLine(process.stdout, 0);
                this.setCursorPosition();
              }, 1000);
            }
            return;
          }
          
          // Then try mention context
          const mentionResult = this.findMentionContext();
          if (mentionResult && mentionResult.needsLoad) {
            // Show loading indicator
            process.stdout.write(chalk.gray('\n🔍 検索中...'));
            
            await this.loadMentionSuggestions(mentionResult.searchTerm);
            
            // Clear loading indicator
            readline.moveCursor(process.stdout, 0, -1);
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            
            if (this.suggestions.length > 0) {
              this.showSuggestions();
            } else {
              // Show "no results" message temporarily
              process.stdout.write(chalk.yellow('\n💡 該当するユーザーが見つかりませんでした'));
              setTimeout(() => {
                readline.moveCursor(process.stdout, 0, -1);
                readline.cursorTo(process.stdout, 0);
                readline.clearLine(process.stdout, 0);
                this.setCursorPosition();
              }, 1000);
            }
          }
          return;
        }

        // Normal key input
        if (key.name === 'backspace') {
          if (this.cursorPos > 0) {
            this.input = this.input.substring(0, this.cursorPos - 1) + this.input.substring(this.cursorPos);
            this.cursorPos--;
          }
        } else if (key.name === 'left') {
          if (this.cursorPos > 0) this.cursorPos--;
        } else if (key.name === 'right') {
          if (this.cursorPos < this.input.length) this.cursorPos++;
        } else if (str && !key.ctrl && !key.meta && key.name !== 'return') {
          this.input = this.input.substring(0, this.cursorPos) + str + this.input.substring(this.cursorPos);
          this.cursorPos++;
        } else {
          return;
        }

        // Update display
        this.clearSuggestions();
        this.redrawInput();
        
        // Auto-update suggestions for commands (/ prefix)
        await this.updateSuggestions();
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  /**
   * Load channel suggestions based on search query
   */
  async loadChannelSuggestions(searchTerm) {
    if (!this.slackClient) {
      this.suggestions = [];
      return;
    }

    // Skip if same query or already loading
    if (this.lastChannelQuery === searchTerm || this.isLoadingChannels) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] チャンネル検索スキップ: "${searchTerm}" (重複/ロード中)`);
      }
      return;
    }

    this.isLoadingChannels = true;
    this.lastChannelQuery = searchTerm;

    if (process.env.DEBUG_CHANNELS) {
      console.error(`[DEBUG] チャンネル検索: "${searchTerm}"`);
    }

    try {
      const channels = await this.slackClient.searchChannels(searchTerm, 10);
      this.suggestions = channels;
      this.suggestionType = 'channel';
      this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;

      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] 検索結果: ${channels.length}件`);
      }
    } catch (error) {
      if (process.env.DEBUG_CHANNELS) {
        console.error(`[DEBUG] チャンネル検索エラー: ${error.message}`);
      }
      this.suggestions = [];
      this.selectedIndex = -1;
    } finally {
      this.isLoadingChannels = false;
    }
  }

  /**
   * Load mention suggestions based on search query
   */
  async loadMentionSuggestions(searchTerm) {
    if (!this.slackClient) {
      this.suggestions = [];
      return;
    }

    // Skip if same query or already loading
    if (this.lastMentionQuery === searchTerm || this.isLoadingMentions) {
      if (process.env.DEBUG_MENTIONS) {
        console.error(`[DEBUG] メンション検索スキップ: "${searchTerm}" (重複/ロード中)`);
      }
      return;
    }

    this.isLoadingMentions = true;
    this.lastMentionQuery = searchTerm;

    if (process.env.DEBUG_MENTIONS) {
      console.error(`[DEBUG] メンション検索: "${searchTerm}", channelId: ${this.channelId}`);
    }

    try {
      const mentions = await this.slackClient.searchMentions(searchTerm, 10, this.channelId);
      this.suggestions = mentions;
      this.suggestionType = 'mention';
      this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;

      if (process.env.DEBUG_MENTIONS) {
        console.error(`[DEBUG] 検索結果: ${mentions.length}件`);
      }
    } catch (error) {
      if (process.env.DEBUG_MENTIONS) {
        console.error(`[DEBUG] メンション検索エラー: ${error.message}`);
      }
      this.suggestions = [];
      this.selectedIndex = -1;
    } finally {
      this.isLoadingMentions = false;
    }
  }

  /**
   * Find mention context at cursor position
   */
  findMentionContext() {
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) return null;
    if (lastAtIndex > 0 && beforeCursor[lastAtIndex - 1] === '<') return null;

    const afterAt = beforeCursor.substring(lastAtIndex + 1);
    if (afterAt.includes(' ')) return null;

    const searchTerm = afterAt;

    return {
      type: 'mention',
      startIndex: lastAtIndex,
      searchTerm: searchTerm,
      needsLoad: true // Signal that we need to load suggestions
    };
  }

  /**
   * Find channel context at cursor position
   */
  findChannelContext() {
    // In auto channel mode, treat entire input as channel search
    if (this.autoChannelMode && this.input.indexOf('#') === -1) {
      const searchTerm = this.input;

      return {
        type: 'channel',
        startIndex: 0,
        searchTerm: searchTerm,
        needsLoad: true // Signal that we need to load suggestions
      };
    }

    // Normal mode: require # prefix
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const lastHashIndex = beforeCursor.lastIndexOf('#');

    if (lastHashIndex === -1) return null;
    if (lastHashIndex > 0 && beforeCursor[lastHashIndex - 1] === '<') return null;

    const afterHash = beforeCursor.substring(lastHashIndex + 1);
    if (afterHash.includes(' ')) return null;

    const searchTerm = afterHash;

    return {
      type: 'channel',
      startIndex: lastHashIndex,
      searchTerm: searchTerm,
      needsLoad: true
    };
  }

  /**
   * Get available commands based on context
   */
  getAvailableCommands() {
    if (this.contextType === 'selection') {
      // Channel selection screen
      return [
        { command: '/<番号>', description: '履歴から選択（例: /1）' },
        { command: '/delete', description: '履歴から削除（例: /delete 1 3 5）', alias: '/del' },
        { command: '/clear', description: '履歴キャッシュをクリア' }
      ];
    } else if (this.contextType === 'thread') {
      // Thread context
      return [
        { command: '/back', description: 'チャンネルに戻る', alias: '/b' },
        { command: '/recent', description: '今日の会話履歴から選択', alias: '/r' },
        { command: '/refresh', description: '今日の投稿を検索して履歴に追加', alias: '/sync' },
        { command: '/rm', description: 'メッセージを削除（例: /rm 1 3 5）' },
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
        { command: '/refresh', description: '今日の投稿を検索して履歴に追加', alias: '/sync' },
        { command: '/rm', description: 'メッセージを削除（例: /rm 1 3 5）' },
        { command: '/exit', description: 'チャット終了', alias: '/quit, /q' },
        { command: '/help', description: 'ヘルプを表示' }
      ];
    }
  }

  /**
   * Find command context at cursor position
   */
  findCommandContext() {
    // Check if input starts with / and cursor is near the beginning
    if (!this.input.startsWith('/')) return null;
    
    const beforeCursor = this.input.substring(0, this.cursorPos);
    
    // Check if we're still in the command part (no space yet)
    if (beforeCursor.includes(' ')) return null;
    
    const searchTerm = beforeCursor.substring(1); // Remove the /
    
    return {
      type: 'command',
      startIndex: 0,
      searchTerm: searchTerm
    };
  }

  /**
   * Load command suggestions based on search query
   */
  loadCommandSuggestions(searchTerm) {
    const commands = this.getAvailableCommands();
    
    // Filter commands based on search term
    const filtered = commands.filter(cmd => {
      const mainMatch = cmd.command.toLowerCase().includes('/' + searchTerm.toLowerCase());
      const aliasMatch = cmd.alias && cmd.alias.toLowerCase().includes(searchTerm.toLowerCase());
      return mainMatch || aliasMatch;
    });
    
    this.suggestions = filtered;
    this.suggestionType = 'command';
    this.selectedIndex = filtered.length > 0 ? 0 : -1;
  }

  /**
   * Update suggestions based on current input
   */
  async updateSuggestions() {
    // Check for command context first
    const commandResult = this.findCommandContext();
    if (commandResult) {
      this.loadCommandSuggestions(commandResult.searchTerm);
      if (this.suggestions.length > 0) {
        this.showSuggestions();
      }
      return;
    }
    
    // No auto-suggestions for @ or # anymore - Tab only
    // This prevents excessive API calls on each keystroke
  }

  /**
   * Show suggestion list
   */
  showSuggestions() {
    if (this.suggestions.length === 0) return;

    if (this.suggestionType === 'command') {
      process.stdout.write('\n' + chalk.gray('コマンド候補 (Tab/↑↓/Ctrl+P/N で選択, Enter確定):'));
      this.suggestions.forEach((cmd, idx) => {
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        const aliasText = cmd.alias ? chalk.gray(` (${cmd.alias})`) : '';
        process.stdout.write('\n' + prefix + chalk.yellow(cmd.command) + aliasText + chalk.gray(` - ${cmd.description}`));
      });
    } else if (this.suggestionType === 'channel') {
      process.stdout.write('\n' + chalk.gray('チャンネル候補 (Tab/↑↓/Ctrl+P/N で選択, Enter確定):'));
      this.suggestions.forEach((channel, idx) => {
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        const icon = channel.is_private ? '🔒' : '#';
        process.stdout.write('\n' + prefix + chalk.yellow(`${icon}${channel.name}`) + chalk.gray(` (${channel.id})`));
      });
    } else {
      process.stdout.write('\n' + chalk.gray('メンション候補 (Tab/↑↓/Ctrl+P/N で選択, Enter確定):'));
      this.suggestions.forEach((member, idx) => {
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        
        const { displayName, realName } = UserHelper.formatForDisplay(member);
        
        process.stdout.write('\n' + prefix + chalk.yellow(`@${displayName}`) + chalk.gray(` (${realName})`));
      });
    }

    const linesToMove = this.suggestions.length + 1;
    readline.moveCursor(process.stdout, 0, -linesToMove);
    this.setCursorPosition();
    
    // IMPORTANT: screenCursorLine remains the same after showing suggestions
    // because we move back to the original position
  }

  /**
   * Clear suggestion list
   */
  clearSuggestions() {
    if (this.suggestions.length === 0) return;

    const linesToClear = this.suggestions.length + 1;
    
    for (let i = 0; i < linesToClear; i++) {
      readline.moveCursor(process.stdout, 0, 1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
    }
    
    readline.moveCursor(process.stdout, 0, -linesToClear);
    
    this.suggestions = [];
    this.selectedIndex = -1;
    
    // Reset query tracking when clearing suggestions
    this.lastChannelQuery = null;
    this.lastMentionQuery = null;
    
    // Reset screenCursorLine after cursor movement
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const linesBeforeCursor = beforeCursor.split('\n');
    this.screenCursorLine = linesBeforeCursor.length - 1;
  }

  /**
   * Redraw suggestions with updated selection
   */
  redrawSuggestions() {
    if (this.suggestions.length === 0) return;

    // Save current cursor position
    const currentLine = this.screenCursorLine;
    
    // Move to suggestion area (2 lines down from input)
    readline.moveCursor(process.stdout, 0, 2);

    if (this.suggestionType === 'command') {
      this.suggestions.forEach((cmd, idx) => {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        const aliasText = cmd.alias ? chalk.gray(` (${cmd.alias})`) : '';
        process.stdout.write(prefix + chalk.yellow(cmd.command) + aliasText + chalk.gray(` - ${cmd.description}`));
        if (idx < this.suggestions.length - 1) {
          readline.moveCursor(process.stdout, 0, 1);
        }
      });
    } else if (this.suggestionType === 'channel') {
      this.suggestions.forEach((channel, idx) => {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        const icon = channel.is_private ? '🔒' : '#';
        process.stdout.write(prefix + chalk.yellow(`${icon}${channel.name}`) + chalk.gray(` (${channel.id})`));
        if (idx < this.suggestions.length - 1) {
          readline.moveCursor(process.stdout, 0, 1);
        }
      });
    } else {
      this.suggestions.forEach((member, idx) => {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        
        const { displayName, realName } = UserHelper.formatForDisplay(member);
        
        process.stdout.write(prefix + chalk.yellow(`@${displayName}`) + chalk.gray(` (${realName})`));
        if (idx < this.suggestions.length - 1) {
          readline.moveCursor(process.stdout, 0, 1);
        }
      });
    }

    // Move back to input line
    const linesToMove = this.suggestions.length + 1;
    readline.moveCursor(process.stdout, 0, -linesToMove);
    this.setCursorPosition();
  }

  /**
   * Redraw input line - Track screen cursor position accurately
   */
  redrawInput() {
    const lines = this.input.split('\n');
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const linesBeforeCursor = beforeCursor.split('\n');
    const currentLineIdx = linesBeforeCursor.length - 1;
    const currentLineText = linesBeforeCursor[currentLineIdx];
    
    if (process.env.DEBUG_READLINE) {
      console.error(`[DEBUG] redrawInput called:`);
      console.error(`  input: ${JSON.stringify(this.input)}`);
      console.error(`  cursorPos: ${this.cursorPos}`);
      console.error(`  screenCursorLine (before): ${this.screenCursorLine}`);
      console.error(`  currentLineIdx: ${currentLineIdx}`);
      console.error(`  lines.length: ${lines.length}`);
      console.error(`  previousLineCount: ${this.previousLineCount}`);
    }
    
    // Step 1: Move to the first line using the tracked screen cursor position
    if (this.screenCursorLine > 0) {
      process.stdout.write(`\x1b[${this.screenCursorLine}A`);
    }
    
    // Step 2: Clear all old lines from the first line
    process.stdout.write('\r');
    const maxLines = Math.max(lines.length, this.previousLineCount);
    for (let i = 0; i < maxLines; i++) {
      process.stdout.write('\x1b[2K'); // Clear entire line
      if (i < maxLines - 1) {
        process.stdout.write('\x1b[B'); // Move down one line
      }
    }
    
    // Step 3: Move back to first line, start of line
    if (maxLines > 1) {
      process.stdout.write(`\x1b[${maxLines - 1}A`);
    }
    process.stdout.write('\r');
    
    // Step 4: Draw all lines
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        process.stdout.write('\n');
      }
      if (i === 0) {
        process.stdout.write(chalk.green('> ') + lines[i]);
      } else {
        process.stdout.write(chalk.green('  ') + lines[i]);
      }
    }
    
    // Step 5: Position cursor at correct location
    const linesToMoveUp = lines.length - 1 - currentLineIdx;
    if (linesToMoveUp > 0) {
      process.stdout.write(`\x1b[${linesToMoveUp}A`);
    }
    
    process.stdout.write('\r');
    const col = 2 + stringWidth(currentLineText);
    if (col > 0) {
      process.stdout.write(`\x1b[${col}C`);
    }
    
    // Step 6: Update tracked positions
    this.previousLineCount = lines.length;
    this.screenCursorLine = currentLineIdx;
    
    if (process.env.DEBUG_READLINE) {
      console.error(`    screenCursorLine (after): ${this.screenCursorLine}`);
    }
  }

  /**
   * Set cursor position (legacy method for compatibility)
   */
  setCursorPosition(lines = null, linesBeforeCursor = null, currentLineIdx = null) {
    // Logic moved to redrawInput()
  }

  /**
   * Insert selected suggestion
   */
  insertSuggestion() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.suggestions.length) return;

    if (this.suggestionType === 'command') {
      const commandResult = this.findCommandContext();
      if (!commandResult) return;

      const selectedCommand = this.suggestions[this.selectedIndex];
      
      // Replace the / part with the selected command
      const afterCursor = this.input.substring(this.cursorPos);
      
      // Extract just the command name (e.g., "/back" from the display)
      const commandName = selectedCommand.command.split(' ')[0];
      
      this.input = commandName + ' ' + afterCursor;
      this.cursorPos = commandName.length + 1;
      
      return { type: 'command', command: selectedCommand };
    } else if (this.suggestionType === 'channel') {
      const channelResult = this.findChannelContext();
      if (!channelResult) return;

      const selectedChannel = this.suggestions[this.selectedIndex];
      
      // In auto channel mode OR if input starts with # (channel switch intent)
      const isChannelSwitchIntent = this.autoChannelMode || 
                                   (channelResult.startIndex === 0 && this.input.startsWith('#'));
      
      if (isChannelSwitchIntent) {
        // Return channel object to trigger channel switch
        return { type: 'channel', channel: selectedChannel };
      } else {
        // Normal mode: insert as channel mention in message
        const beforeHash = this.input.substring(0, channelResult.startIndex);
        const afterCursor = this.input.substring(this.cursorPos);

        this.input = beforeHash + `<#${selectedChannel.id}|${selectedChannel.name}>` + afterCursor;
        this.cursorPos = beforeHash.length + selectedChannel.id.length + selectedChannel.name.length + 5;
      }
      
      return { type: 'channel', channel: selectedChannel, inserted: true };
    } else {
      const mentionResult = this.findMentionContext();
      if (!mentionResult) return;

      const selectedMention = this.suggestions[this.selectedIndex];
      const beforeAt = this.input.substring(0, mentionResult.startIndex);
      const afterCursor = this.input.substring(this.cursorPos);

      // Handle special mentions differently
      if (selectedMention.type === 'special') {
        this.input = beforeAt + `<!${selectedMention.id}>` + afterCursor;
        this.cursorPos = beforeAt.length + selectedMention.id.length + 3;
      } else if (selectedMention.type === 'usergroup') {
        // User group mention format: <!subteam^GROUP_ID|@handle>
        this.input = beforeAt + `<!subteam^${selectedMention.id}|@${selectedMention.handle}>` + afterCursor;
        this.cursorPos = beforeAt.length + `<!subteam^${selectedMention.id}|@${selectedMention.handle}>`.length;
      } else {
        // Regular user mention
        this.input = beforeAt + `<@${selectedMention.id}>` + afterCursor;
        this.cursorPos = beforeAt.length + selectedMention.id.length + 3;
      }
      
      return { type: 'mention', mention: selectedMention };
    }
  }
}

module.exports = ReadlineInput;
