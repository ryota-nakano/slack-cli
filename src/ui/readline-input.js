/**
 * Readline Input Mode
 * Interactive input with mention autocomplete
 */

const readline = require('readline');
const chalk = require('chalk');
const stringWidth = require('string-width');

class ReadlineInput {
  constructor(channelMembers = []) {
    this.members = channelMembers;
    this.input = '';
    this.cursorPos = 0;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.rl = null;
    this.previousLineCount = 1;
    this.inputStartLine = 0; // Track the starting line of our input
  }

  /**
   * Show prompt and wait for input
   */
  async prompt(channelName) {
    return new Promise((resolve) => {
      console.log(chalk.cyan(`💬 #${channelName}[スレッド]`));
      
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
      });

      // Manually show prompt and save position
      process.stdout.write(chalk.green('> '));
      process.stdout.write('\x1b[s'); // Save cursor position for later use

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
          this.clearSuggestions();
          this.redrawInput();
          this.updateSuggestions();
          return;
        }

        // Enter: Submit
        if (key.name === 'return') {
          if (this.suggestions.length > 0) {
            this.insertSuggestion();
            this.clearSuggestions();
            this.redrawInput();
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
          const result = this.findMentionContext();
          if (result && result.candidates.length > 0) {
            this.suggestions = result.candidates;
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
      startIndex: lastAtIndex,
      searchTerm: afterAt,
      candidates: candidates.slice(0, 10)
    };
  }

  /**
   * Update suggestions based on current input
   */
  updateSuggestions() {
    const result = this.findMentionContext();
    if (result && result.candidates.length > 0) {
      this.suggestions = result.candidates;
      this.selectedIndex = 0;
      this.showSuggestions();
    }
  }

  /**
   * Show suggestion list
   */
  showSuggestions() {
    if (this.suggestions.length === 0) return;

    process.stdout.write('\n' + chalk.gray('候補 (Tab/↑↓で選択, Enter確定):'));
    this.suggestions.forEach((member, idx) => {
      const isSelected = idx === this.selectedIndex;
      const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
      process.stdout.write('\n' + prefix + chalk.yellow(`@${member.displayName}`) + chalk.gray(` (${member.realName})`));
    });

    const linesToMove = this.suggestions.length + 1;
    readline.moveCursor(process.stdout, 0, -linesToMove);
    this.setCursorPosition();
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
  }

  /**
   * Redraw suggestions with updated selection
   */
  redrawSuggestions() {
    if (this.suggestions.length === 0) return;

    readline.moveCursor(process.stdout, 0, 2);

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

    readline.moveCursor(process.stdout, 0, -(this.suggestions.length + 1));
    this.setCursorPosition();
  }

  /**
   * Redraw input line
   */
  redrawInput() {
    const lines = this.input.split('\n');
    const beforeCursor = this.input.substring(0, this.cursorPos);
    const linesBeforeCursor = beforeCursor.split('\n');
    const currentLineIdx = linesBeforeCursor.length - 1;
    const currentLineText = linesBeforeCursor[currentLineIdx];
    
    // Restore to the initial prompt position (saved in prompt())
    process.stdout.write('\x1b[u'); // Restore cursor position
    
    // Move to column 0 (start of "> ")
    process.stdout.write('\r');
    
    // Clear all old lines from here
    const maxLines = Math.max(lines.length, this.previousLineCount);
    for (let i = 0; i < maxLines; i++) {
      process.stdout.write('\x1b[2K'); // Clear line
      if (i < maxLines - 1) {
        process.stdout.write('\n'); // Move to next line
      }
    }
    
    // Move back to the starting position
    if (maxLines > 1) {
      process.stdout.write(`\x1b[${maxLines - 1}A`); // Move up
    }
    process.stdout.write('\r'); // Start of line
    
    // Draw all content
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        process.stdout.write(chalk.green('> ') + lines[i]);
      } else {
        process.stdout.write(chalk.green('  ') + lines[i]);
      }
      if (i < lines.length - 1) {
        process.stdout.write('\n');
      }
    }
    
    // Position cursor: we're now at end of last line
    // Need to move to currentLineIdx
    const linesUp = lines.length - 1 - currentLineIdx;
    if (linesUp > 0) {
      process.stdout.write(`\x1b[${linesUp}A`);
    }
    
    // Set column position
    const col = 2 + stringWidth(currentLineText);
    process.stdout.write(`\x1b[${col}G`);
    
    // Update previous line count
    this.previousLineCount = lines.length;
  }

  /**
   * Set cursor position based on input (legacy method, now integrated in redrawInput)
   */
  setCursorPosition(lines = null, linesBeforeCursor = null, currentLineIdx = null) {
    // This method is kept for compatibility but logic moved to redrawInput
  }

  /**
   * Insert selected suggestion
   */
  insertSuggestion() {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.suggestions.length) return;

    const result = this.findMentionContext();
    if (!result) return;

    const selectedMember = this.suggestions[this.selectedIndex];
    const beforeAt = this.input.substring(0, result.startIndex);
    const afterCursor = this.input.substring(this.cursorPos);

    this.input = beforeAt + `<@${selectedMember.id}>` + afterCursor;
    this.cursorPos = beforeAt.length + selectedMember.id.length + 3;
  }
}

module.exports = ReadlineInput;
