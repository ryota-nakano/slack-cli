/**
 * Configuration Manager
 * Handles config file in user's home directory
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const chalk = require('chalk');

// Config directory: ~/.config/slack-cli/
const CONFIG_DIR = path.join(os.homedir(), '.config', 'slack-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config');

/**
 * Get config file path
 */
function getConfigPath() {
  return CONFIG_FILE;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration
 * Priority: 1) .env in current dir, 2) project root .env, 3) ~/.config/slack-cli/config
 */
function loadConfig() {
  // Try .env files first (for development)
  const localEnv = path.join(process.cwd(), '.env');
  const projectEnv = path.join(__dirname, '..', '..', '.env');
  
  if (fs.existsSync(localEnv)) {
    require('dotenv').config({ path: localEnv });
    return;
  }
  
  if (fs.existsSync(projectEnv)) {
    require('dotenv').config({ path: projectEnv });
    return;
  }
  
  // Load from user config file
  if (fs.existsSync(CONFIG_FILE)) {
    const config = parseConfigFile(CONFIG_FILE);
    Object.keys(config).forEach(key => {
      process.env[key] = config[key];
    });
  }
}

/**
 * Parse config file (simple KEY=VALUE format)
 */
function parseConfigFile(filePath) {
  const config = {};
  const content = fs.readFileSync(filePath, 'utf-8');
  
  content.split('\n').forEach(line => {
    line = line.trim();
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) return;
    
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match) {
      config[match[1]] = match[2];
    }
  });
  
  return config;
}

/**
 * Check if config exists and is valid
 */
function hasValidConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return false;
  }
  
  const config = parseConfigFile(CONFIG_FILE);
  return !!(config.SLACK_USER_TOKEN || config.SLACK_BOT_TOKEN);
}

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive setup wizard
 */
async function runSetup() {
  console.log(chalk.bold.cyan('\n🚀 Slack CLI セットアップ\n'));
  
  console.log('Slack APIトークンを取得するには:');
  console.log(chalk.yellow('1. https://api.slack.com/apps にアクセス'));
  console.log(chalk.yellow('2. アプリを作成または選択'));
  console.log(chalk.yellow('3. "OAuth & Permissions" から User Token を取得'));
  console.log(chalk.yellow('4. 必要なスコープ: channels:history, channels:read, chat:write, users:read, usergroups:read\n'));
  
  const token = await prompt(chalk.green('Slack User Token (xoxp-...): '));
  
  if (!token || !token.startsWith('xoxp-')) {
    console.log(chalk.red('\n❌ 有効なUser Tokenを入力してください (xoxp-で始まる必要があります)'));
    process.exit(1);
  }
  
  const editor = await prompt(chalk.green('エディタ (デフォルト: vim): ')) || 'vim';
  
  // Save config
  ensureConfigDir();
  
  const configContent = `# Slack CLI Configuration
# Generated on ${new Date().toISOString()}

# Slack User Token
SLACK_USER_TOKEN=${token}

# Editor
EDITOR=${editor}
`;
  
  fs.writeFileSync(CONFIG_FILE, configContent, 'utf-8');
  fs.chmodSync(CONFIG_FILE, 0o600); // Readable only by owner
  
  console.log(chalk.bold.green('\n✅ 設定を保存しました!'));
  console.log(chalk.gray(`設定ファイル: ${CONFIG_FILE}\n`));
  console.log(chalk.cyan('これで "slack" コマンドを使用できます!\n'));
}

/**
 * Show config location and contents
 */
function showConfig() {
  console.log(chalk.bold.cyan('\n📝 設定情報\n'));
  console.log(chalk.gray(`設定ファイル: ${CONFIG_FILE}\n`));
  
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('⚠️  設定ファイルが見つかりません'));
    console.log(chalk.gray('実行してください: slack setup\n'));
    return;
  }
  
  const config = parseConfigFile(CONFIG_FILE);
  
  console.log('設定内容:');
  if (config.SLACK_USER_TOKEN) {
    const masked = config.SLACK_USER_TOKEN.substring(0, 10) + '...' + config.SLACK_USER_TOKEN.substring(config.SLACK_USER_TOKEN.length - 4);
    console.log(chalk.green(`  SLACK_USER_TOKEN: ${masked}`));
  }
  if (config.SLACK_BOT_TOKEN) {
    const masked = config.SLACK_BOT_TOKEN.substring(0, 10) + '...' + config.SLACK_BOT_TOKEN.substring(config.SLACK_BOT_TOKEN.length - 4);
    console.log(chalk.green(`  SLACK_BOT_TOKEN: ${masked}`));
  }
  if (config.EDITOR) {
    console.log(chalk.green(`  EDITOR: ${config.EDITOR}`));
  }
  console.log();
}

module.exports = {
  loadConfig,
  hasValidConfig,
  runSetup,
  showConfig,
  getConfigPath
};
