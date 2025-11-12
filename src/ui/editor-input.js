/**
 * Editor Input Mode
 * Launch external editor (vim, nano, etc.) for message composition
 */

const { spawn } = require('child_process');
const { tmpdir } = require('os');
const { join } = require('path');
const { readFile, unlink, access } = require('fs').promises;

class EditorInput {
  constructor() {
    this.editor = process.env.EDITOR || process.env.VISUAL || 'vim';
  }

  /**
   * Launch editor and wait for input
   */
  async prompt() {
    return new Promise((resolve, reject) => {
      const tmpFile = join(tmpdir(), `slack-cli-${Date.now()}.txt`);

      const editorProcess = spawn(this.editor, [tmpFile], {
        stdio: 'inherit'
      });

      editorProcess.on('exit', async (code) => {
        try {
          const exists = await access(tmpFile).then(() => true).catch(() => false);
          if (!exists) {
            resolve('__CANCELLED__');
            return;
          }

          const content = await readFile(tmpFile, 'utf-8');
          await unlink(tmpFile).catch(() => {});

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
