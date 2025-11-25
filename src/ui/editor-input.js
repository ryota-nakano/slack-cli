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

      // If reference messages are provided, save them to a file
      if (this.referenceMessages && this.referenceMessages.length > 0) {
        try {
          await writeFile(referenceFile, this.referenceMessages, 'utf-8');
          console.log(chalk.cyan(`\n📝 エディタを起動します...`));
          console.log(chalk.gray(`💡 ヒント: 参照用メッセージは ${referenceFile} に保存されています`));
          if (this.editor.includes('vim') || this.editor.includes('nvim')) {
            console.log(chalk.gray(`💡 Vimユーザー: :split ${referenceFile} で参照を表示できます`));
          } else if (this.editor.includes('emacs')) {
            console.log(chalk.gray(`💡 Emacsユーザー: C-x 2 して C-x C-f ${referenceFile} で参照を表示できます`));
          }
          console.log('');
        } catch (error) {
          console.error(chalk.yellow('⚠️  参照ファイルの作成に失敗しました'));
        }
      }

      const editorProcess = spawn(this.editor, [tmpFile], {
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
