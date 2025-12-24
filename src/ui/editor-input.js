/**
 * Editor Input Mode
 * Launch external editor (vim, nano, etc.) for message composition
 */

const { spawn } = require('child_process');
const { tmpdir } = require('os');
const { join } = require('path');
const { readFile, unlink, access, writeFile } = require('fs').promises;
const chalk = require('chalk');

class EditorInput {
  constructor(referenceMessages = null, initialText = null) {
    this.editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    this.referenceMessages = referenceMessages; // Messages to display as reference
    this.initialText = initialText; // Initial text to edit
  }

  /**
   * Launch editor and wait for input
   */
  async prompt() {
    return new Promise(async (resolve, reject) => {
      const tmpFile = join(tmpdir(), `slack-cli-${Date.now()}.txt`);
      const referenceFile = join(tmpdir(), `slack-cli-ref-${Date.now()}.txt`);
      const wrapperScript = join(tmpdir(), `slack-cli-wrapper-${Date.now()}.sh`);

      // If initial text is provided, write it to the temp file
      if (this.initialText) {
        try {
          await writeFile(tmpFile, this.initialText, 'utf-8');
          console.log(chalk.cyan(`\n📝 エディタを起動します（編集モード）...\n`));
        } catch (error) {
          console.error(chalk.yellow('⚠️  一時ファイルの作成に失敗しました'));
        }
      }

      let editorCommand = this.editor;
      let editorArgs = [tmpFile];
      
      // If reference messages are provided, save them to a file
      if (this.referenceMessages && this.referenceMessages.length > 0) {
        try {
          await writeFile(referenceFile, this.referenceMessages, 'utf-8');
          console.log(chalk.cyan(`\n📝 エディタを起動します（参照メッセージ付き）...\n`));
          console.log(chalk.gray(`💡 ヒント: :wqa または :qa で全ウィンドウを閉じます\n`));
          
          // Setup editor-specific split commands
          if (this.editor.includes('vim') || this.editor.includes('nvim')) {
            // Vim: Use -o to open files in horizontal splits
            // -o opens files in horizontal splits, with the last file being the active one
            editorArgs = [
              '-o2',                            // Open 2 windows horizontally
              referenceFile,                    // Reference file (top)
              tmpFile,                          // Input file (bottom)
              '-c', 'wincmd j',                 // Move to bottom window
              '-c', 'setlocal bufhidden=wipe',  // Wipe buffer when hidden
              '-c', 'wincmd k',                 // Move to top window
              '-c', 'setlocal buftype=nofile',  // Make reference buffer scratch (no file backing)
              '-c', 'wincmd j',                 // Back to input window
              '-c', 'normal G$'                 // Move cursor to end of file
            ];
          } else if (this.editor.includes('emacs')) {
            // Emacs: Open with split layout
            editorArgs = [
              '--eval', `(progn (find-file "${tmpFile}") (split-window-below) (other-window 1) (find-file "${referenceFile}") (view-mode 1) (other-window 1))`,
            ];
          } else {
            // Other editors: just show hint
            console.log(chalk.gray(`💡 参照用メッセージは ${referenceFile} に保存されています`));
            console.log('');
          }
        } catch (error) {
          console.error(chalk.yellow('⚠️  参照ファイルの作成に失敗しました'));
        }
      } else if (this.initialText && (this.editor.includes('vim') || this.editor.includes('nvim'))) {
        // If only initial text (no reference), move cursor to end
        editorArgs = [
          tmpFile,
          '-c', 'normal G$'       // Move cursor to end of file
        ];
      }

      const editorProcess = spawn(editorCommand, editorArgs, {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          const exists = await access(tmpFile).then(() => true).catch(() => false);
          if (!exists) {
            // Cleanup reference file
            if (this.referenceMessages) {
              await unlink(referenceFile).catch(() => {});
              await unlink(wrapperScript).catch(() => {});
            }
            resolve('__CANCELLED__');
            return;
          }

          const content = await readFile(tmpFile, 'utf-8');
          await unlink(tmpFile).catch(() => {});
          
          // Cleanup reference file
          if (this.referenceMessages) {
            await unlink(referenceFile).catch(() => {});
            await unlink(wrapperScript).catch(() => {});
          }

          if (content.trim() === '') {
            resolve('__CANCELLED__');
            return;
          }

          resolve(content.trim());
        } catch (error) {
          reject(error);
        }
      });

      editorProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = EditorInput;
