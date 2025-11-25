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
  constructor(referenceMessages = null) {
    this.editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    this.referenceMessages = referenceMessages; // Messages to display as reference
  }

  /**
   * Launch editor and wait for input
   */
  async prompt() {
    return new Promise(async (resolve, reject) => {
      const tmpFile = join(tmpdir(), `slack-cli-${Date.now()}.txt`);
      const referenceFile = join(tmpdir(), `slack-cli-ref-${Date.now()}.txt`);

      let editorArgs = [tmpFile];
      
      // If reference messages are provided, save them to a file
      if (this.referenceMessages && this.referenceMessages.length > 0) {
        try {
          await writeFile(referenceFile, this.referenceMessages, 'utf-8');
          console.log(chalk.cyan(`\n📝 エディタを起動します（参照メッセージ付き）...\n`));
          
          // Setup editor-specific split commands
          if (this.editor.includes('vim') || this.editor.includes('nvim')) {
            // Vim: Open with split layout
            // -c commands are executed in order after opening the file
            editorArgs = [
              '-c', `split ${referenceFile}`,  // Split and open reference file
              '-c', 'wincmd j',                 // Move to bottom window (input file)
              '-c', 'startinsert',              // Start in insert mode
              tmpFile
            ];
          } else if (this.editor.includes('emacs')) {
            // Emacs: Open with split layout
            editorArgs = [
              '--eval', `(progn (find-file "${tmpFile}") (split-window-below) (other-window 1) (find-file "${referenceFile}") (other-window 1))`,
            ];
          } else {
            // Other editors: just show hint
            console.log(chalk.gray(`💡 参照用メッセージは ${referenceFile} に保存されています`));
            console.log('');
          }
        } catch (error) {
          console.error(chalk.yellow('⚠️  参照ファイルの作成に失敗しました'));
        }
      }

      const editorProcess = spawn(this.editor, editorArgs, {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          const exists = await access(tmpFile).then(() => true).catch(() => false);
          if (!exists) {
            // Cleanup reference file
            if (this.referenceMessages) {
              await unlink(referenceFile).catch(() => {});
            }
            resolve('__CANCELLED__');
            return;
          }

          const content = await readFile(tmpFile, 'utf-8');
          await unlink(tmpFile).catch(() => {});
          
          // Cleanup reference file
          if (this.referenceMessages) {
            await unlink(referenceFile).catch(() => {});
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
