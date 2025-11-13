/**
 * Readline Input Mode
 * Interactive input with mention autocomplete
 */

const readline = require('readline');
const chalk = require('chalk');
const stringWidth = require('string-width');

class ReadlineInput {
  constructor(channelMembers = [], channels = []) {
    this.members = channelMembers;
    this.channels = channels;
    this.input = '';
    this.cursorPos = 0;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.suggestionType = null; // 'mention' or 'channel'
    this.rl = null;
    this.previousLineCount = 1;
    this.screenCursorLine = 0; // Track which line the cursor is actually on screen (0-based)
  }

  /**
   * Show prompt and wait for input
   * @param {string} contextName - Context name (already formatted with [スレッド] if needed)
   */
  async prompt(contextName) {
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

      const onKeypress = (str, key) => {
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

        // Ctrl+J: Insert newline
        if (key.ctrl && key.name === 'j') {
          this.input = this.input.substring(0, this.cursorPos) + '\n' + this.input.substring(this.cursorPos);
          this.cursorPos++;
          this.screenCursorLine++; // Update screen cursor line immediately after newline
          this.clearSuggestions();
          this.redrawInput();
          return;
        }

        // Enter: Submit or select suggestion
        if (key.name === 'return') {
          if (this.suggestions.length > 0) {
            const result = this.insertSuggestion();
            this.clearSuggestions();
            this.redrawInput();
            
            // If channel was selected, signal special handling
            if (result && result.type === 'channel') {
              cleanup();
              resolve({ type: 'channel', channel: result.channel });
              return;
            }
            
            this.updateSuggestions();
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
          if (key.name === 'up') {
            this.selectedIndex = this.selectedIndex > 0
              ? this.selectedIndex - 1
              : this.suggestions.length - 1;
            this.redrawSuggestions();
            return;
          }

          if (key.name === 'down') {
            this.selectedIndex = this.selectedIndex < this.suggestions.length - 1
              ? this.selectedIndex + 1
              : 0;
            this.redrawSuggestions();
            return;
          }

          if (key.name === 'tab') {
            this.insertSuggestion();
            this.clearSuggestions();
            this.redrawInput();
            this.updateSuggestions();
            return;
          }
        } else if (key.name === 'tab') {
          // Try channel context first
          const channelResult = this.findChannelContext();
          if (channelResult && channelResult.candidates.length > 0) {
            this.suggestions = channelResult.candidates;
            this.suggestionType = 'channel';
            this.selectedIndex = 0;
            this.showSuggestions();
            return;
          }
          
          // Then try mention context
          const mentionResult = this.findMentionContext();
          if (mentionResult && mentionResult.candidates.length > 0) {
            this.suggestions = mentionResult.candidates;
            this.suggestionType = 'mention';
            this.selectedIndex = 0;
            this.showSuggestions();
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
        this.updateSuggestions();
      };

      process.stdin.on('keypress', onKeypress);
    });
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

    const searchTerm = afterAt.toLowerCase();
    const candidates = this.members.filter(member => {
      return member.displayName.toLowerCase().includes(searchTerm) ||
             member.realName.toLowerCase().includes(searchTerm);
    });

    if (candidates.length === 0) return null;

    return {
      type: 'mention',
      startIndex: lastAtIndex,
      searchTerm: afterAt,
      candidates: candidates.slice(0, 10)
    };
  }

  /**
   * Find channel context at cursor position
   */
  findChannelContext() {
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const lastHashIndex = beforeCursor.lastIndexOf('#');

    if (lastHashIndex === -1) return null;
    if (lastHashIndex > 0 && beforeCursor[lastHashIndex - 1] === '<') return null;

    const afterHash = beforeCursor.substring(lastHashIndex + 1);
    if (afterHash.includes(' ')) return null;

    const searchTerm = afterHash.toLowerCase();
    const candidates = this.channels.filter(channel => {
      return channel.name.toLowerCase().includes(searchTerm);
    });

    if (candidates.length === 0) return null;

    return {
      type: 'channel',
      startIndex: lastHashIndex,
      searchTerm: afterHash,
      candidates: candidates.slice(0, 10)
    };
  }

  /**
   * Update suggestions based on current input
   */
  updateSuggestions() {
    // Try channel context first
    const channelResult = this.findChannelContext();
    if (channelResult && channelResult.candidates.length > 0) {
      this.suggestions = channelResult.candidates;
      this.suggestionType = 'channel';
      this.selectedIndex = 0;
      this.showSuggestions();
      return;
    }

    // Then try mention context
    const mentionResult = this.findMentionContext();
    if (mentionResult && mentionResult.candidates.length > 0) {
      this.suggestions = mentionResult.candidates;
      this.suggestionType = 'mention';
      this.selectedIndex = 0;
      this.showSuggestions();
      return;
    }
  }

  /**
   * Show suggestion list
   */
  showSuggestions() {
    if (this.suggestions.length === 0) return;

    if (this.suggestionType === 'channel') {
      process.stdout.write('\n' + chalk.gray('チャンネル候補 (Tab/↑↓で選択, Enter確定):'));
      this.suggestions.forEach((channel, idx) => {
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        const icon = channel.is_private ? '🔒' : '#';
        process.stdout.write('\n' + prefix + chalk.yellow(`${icon}${channel.name}`) + chalk.gray(` (${channel.id})`));
      });
    } else {
      process.stdout.write('\n' + chalk.gray('メンション候補 (Tab/↑↓で選択, Enter確定):'));
      this.suggestions.forEach((member, idx) => {
        const isSelected = idx === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
        process.stdout.write('\n' + prefix + chalk.yellow(`@${member.displayName}`) + chalk.gray(` (${member.realName})`));
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

    readline.moveCursor(process.stdout, 0, 2);

    if (this.suggestionType === 'channel') {
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
        process.stdout.write(prefix + chalk.yellow(`@${member.displayName}`) + chalk.gray(` (${member.realName})`));
        if (idx < this.suggestions.length - 1) {
          readline.moveCursor(process.stdout, 0, 1);
        }
      });
    }

    readline.moveCursor(process.stdout, 0, -(this.suggestions.length + 1));
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

    if (this.suggestionType === 'channel') {
      const channelResult = this.findChannelContext();
      if (!channelResult) return;

      const selectedChannel = this.suggestions[this.selectedIndex];
      const beforeHash = this.input.substring(0, channelResult.startIndex);
      const afterCursor = this.input.substring(this.cursorPos);

      this.input = beforeHash + `<#${selectedChannel.id}|${selectedChannel.name}>` + afterCursor;
      this.cursorPos = beforeHash.length + selectedChannel.id.length + selectedChannel.name.length + 5;
      
      return { type: 'channel', channel: selectedChannel };
    } else {
      const mentionResult = this.findMentionContext();
      if (!mentionResult) return;

      const selectedMember = this.suggestions[this.selectedIndex];
      const beforeAt = this.input.substring(0, mentionResult.startIndex);
      const afterCursor = this.input.substring(this.cursorPos);

      this.input = beforeAt + `<@${selectedMember.id}>` + afterCursor;
      this.cursorPos = beforeAt.length + selectedMember.id.length + 3;
      
      return { type: 'mention', member: selectedMember };
    }
  }
}

module.exports = ReadlineInput;
