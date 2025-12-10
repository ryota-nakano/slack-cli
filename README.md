# Slack CLI

🚀 **ターミナルで動作するSlackチャットクライアント（スレッド対応・メンション補完機能付き）**

## ✨ 特徴

- 💬 ターミナル上でインタラクティブなスレッドチャット
- 🏷️ @メンション・グループメンション自動補完（Tab/矢印キーで選択）
- 🔍 チャンネル検索・補完（#で起動）
- 📜 今日の会話履歴からクイックアクセス（/rコマンド、Ctrl+R）
- 🗑️ 履歴削除機能（/deleteコマンド）
- 🌐 ブラウザで開く（/wコマンド、Ctrl+W）
- ⚡ `/r`実行後は`/`なしで番号入力可能（例: `/r` → `1`で移動）
- ⏸️ `/r`実行中はポーリング停止（履歴選択に集中）
- ⚡ 超高速起動（約0.3秒で即座に操作可能）
- 📝 2つの入力モード：Readline（デフォルト）& Editor（vim/nano）
- 🔄 リアルタイムメッセージ更新（10秒ごとにポーリング）
- ✅ 自動既読マーク機能
- 🎨 絵文字表示対応（`:smile:` → 😄）
- 🎨 Slackマークダウン表示（*太字*、_斜体_、~取り消し線~、`コード`）
- 📎 添付ファイルURL表示
- 🗑️ キャッシュクリア機能（`slack clear-cache`）
- ⚡ 自分の投稿も即座に反映
- 🌏 完全な日本語対応
- 💾 ユーザー・チャンネル情報キャッシュによる高速化
- 📅 デフォルトで今日の履歴のみ表示（/prev, /next、/dateで日付移動）
- 📊 履歴に日付・時刻表示（いつのスレッドか一目で把握）
- 📝 長いテキストプレビュー（100文字まで表示）
- 🤖 自動応答モード（/autoコマンド、OpenAI API連携）

## 📦 インストール

### GitHub Packagesからインストール（推奨）

```bash
# 1. GitHub Personal Access Token (classic) を作成
# https://github.com/settings/tokens で以下のスコープを選択:
# - read:packages

# 2. npmにGitHub Packagesの認証を設定
echo "@ryota-nakano:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# 3. パッケージをグローバルインストール
npm install -g @ryota-nakano/slack-cli

# 4. 初期設定（対話的にSlackトークンを設定）
slack setup
```

### ローカル開発用インストール

```bash
# リポジトリをクローン
git clone https://github.com/ryota-nakano/slack-cli.git
cd slack-cli

# 依存関係をインストール
npm install

# 環境設定
cp .env.example .env
# .envを編集してSlackトークンを追加
```

## 🔑 Slackトークンのセットアップ

### 簡単セットアップ（グローバルインストール時）

```bash
slack setup
```

このコマンドで対話的に設定できます。設定は `~/.config/slack-cli/config` に保存されます。

### 手動セットアップ

1. https://api.slack.com/apps にアクセス
2. 新しいアプリを作成するか既存のアプリを選択
3. "OAuth & Permissions" に移動
4. 必要なスコープを追加：

   **必須スコープ：**
   - `channels:history` - チャンネルの履歴を読む
   - `channels:read` - チャンネル一覧を読む
   - `chat:write` - メッセージを送信
   - `users:read` - ユーザー情報を読む
   - `groups:history` - プライベートチャンネルの履歴を読む
   - `groups:read` - プライベートチャンネル一覧を読む
   - `im:history` - DM（ダイレクトメッセージ）の履歴を読む
   - `im:read` - DM一覧を読む
   - `mpim:history` - グループDMの履歴を読む
   - `mpim:read` - グループDM一覧を読む
   - `search:read` - メッセージ検索（/refreshコマンド用）
   
   **オプションスコープ：**
   - `usergroups:read` - ユーザーグループ（@developers等）の名前を表示
   - `channels:write` - 既読マーク機能（チャンネル用）
   - `groups:write` - 既読マーク機能（プライベートチャンネル用）
   - `im:write` - 既読マーク機能（DM用）
   - `mpim:write` - 既読マーク機能（グループDM用）
   - `reactions:read` - リアクションしたメッセージの一覧取得（/rコマンドで表示）
   - `reactions:write` - リアクションの削除（/delete コマンドでリアクション削除）
   
5. ワークスペースにインストールしてトークンを取得

**推奨：** 自分の名前で投稿するにはUser Token（`xoxp-`で始まる）を使用してください

**Note:** 
- `usergroups:read` スコープがない場合、グループメンションは `@<GROUP_ID>` 形式で表示されます
- `channels:write`/`groups:write`/`im:write`/`mpim:write` スコープがない場合、既読マーク機能は動作しませんが、他の機能は正常に使えます
- `reactions:read` スコープがない場合、リアクションしたメッセージは履歴に表示されません
- `reactions:write` スコープがない場合、リアクションの削除はできません
- `im:history`/`im:read` スコープがない場合、DMは表示できません
- `mpim:history`/`mpim:read` スコープがない場合、グループDMは表示できません

### 設定ファイルの場所

- グローバルインストール: `~/.config/slack-cli/config`
- ローカル開発: プロジェクトルートの `.env`

設定を確認:
```bash
slack config
```

### 環境変数でカスタマイズ（オプション）

`.env`ファイルまたは`~/.config/slack-cli/config`で以下の設定が可能です：

```bash
# 表示設定
INITIAL_MESSAGE_COUNT=30        # 初期表示メッセージ数（デフォルト: 30）
MESSAGE_INCREMENT=30            # メッセージ追加表示数（デフォルト: 30）
TEXT_PREVIEW_LENGTH=100         # テキストプレビュー最大長（デフォルト: 100）
HISTORY_LIMIT=20                # 履歴保持数（デフォルト: 20）

# API/キャッシュ設定
CACHE_TTL=3600000               # キャッシュ有効期限（ミリ秒、デフォルト: 3600000 = 1時間）
SEARCH_RESULT_LIMIT=20          # 検索結果表示数（デフォルト: 20）
MENTION_SEARCH_LIMIT=10         # メンション検索結果表示数（デフォルト: 10）
REACTION_FETCH_LIMIT=20         # リアクション取得数（デフォルト: 20）
USER_BATCH_LIMIT=50             # ユーザー一括取得の最大数（デフォルト: 50）

# エディタ設定
EDITOR=vim                      # 使用するエディタ（デフォルト: vim）
```

## 🚀 使い方

### 基本的な使い方

```bash
# デフォルトでチャンネル選択画面が起動
slack

# 初期設定
slack setup

# 設定確認
slack config

# キャッシュをクリア
slack clear-cache

# チャンネル一覧を表示
slack channels

# ヘルプを表示
slack --help
```

### ローカルで使う

```bash
npm start
# または
node src/index.js
```

### チャンネル一覧

```bash
npm run channels
# または
node src/index.js channels
```

### スレッドチャット開始

```bash
node src/index.js thread <channel_id> <thread_ts>
```

**例：**
```bash
node src/index.js thread C03BMM307B5 1762907616.178439
```

## ⌨️ キーボードショートカット

### チャンネル選択画面

| キー | 動作 |
|-----|------|
| `#` + 入力 + `Tab` | チャンネル検索・補完 |
| `Tab` / `↑↓` | チャンネル候補選択 |
| `/` + 番号 | 今日の会話履歴から直接チャンネル/スレッドに移動（例: /3） |
| `/r` | 今日の会話履歴を表示 |
| `/delete <番号>` | 履歴から削除（例: /delete 1 3 5） |

### チャット画面

| キー | 動作 |
|-----|------|
| `Ctrl+Enter` | メッセージ送信 |
| `Ctrl+J` | 改行挿入（複数行メッセージ） |
| `Ctrl+N` | 次のスレッド番号を入力（/1 → /2 → /3） |
| `Ctrl+P` | 前のスレッド番号を入力（/3 → /2 → /1） |
| `@` + 入力 + `Tab` | メンション・グループメンション補完 |
| `#` + 入力 + `Tab` | チャンネル検索・補完 |
| `Tab` / `↑↓` | 候補選択 |
| `Ctrl+E` | 外部エディタ起動（vim/nano） |
| `Ctrl+R` | 今日の会話履歴の表示/非表示をトグル |
| `Ctrl+W` | ブラウザで開く（/wと同じ） |
| `/` + 番号 | スレッドに移動（例: /5） |
| `/prev` or `/p` | 前日の履歴を表示 |
| `/next` or `/n` | 次の日の履歴を表示 |
| `/date YYYY-MM-DD` or `/d` | 指定日付の履歴を表示 |
| `/today` | 今日の履歴に戻る |
| `/history` or `/h` | 過去の履歴を表示（デフォルト20件） |
| `/more` or `/m` | スレッドでさらに30件の過去メッセージを表示 |
| `/back` or `/b` | スレッドからチャンネルに戻る |
| `/r` or `/recent` | 今日の会話履歴の表示/非表示をトグル（実行後は`/`なしで番号入力可能） |
| `/delete <番号>` or `/del <番号>` | /recentモード中に履歴削除（例: /delete 1 3 5） |
| `/cancel` or `/c` | 履歴選択モードを解除（/rと同じ） |
| `/refresh` or `/sync` | 今日の投稿を検索して履歴に追加 |
| `/reload` or `/rl` | メッセージを再取得（最新の状態に更新） |
| `/clear` | 履歴キャッシュをクリア |
| `/w` | ブラウザで現在のチャンネル/スレッドを開く |
| `/link [番号]` | メッセージリンクを表示（例: /link 5） |
| `/edit <番号>` | メッセージを編集（例: /edit 5） |
| `/rm <番号>` | メッセージ削除（例: /rm 5、複数指定可: /rm 1 3 5） |
| `/auto` | 自動応答モードの切り替え（OpenAI API連携、文体自動学習） |
| `/autoall` | 全メッセージ返信モードの切り替え |
| `/style` | 学習済みの文体スタイルを表示 |
| `/styleclear` | 文体スタイルをクリア |
| `/help` | チャット中のヘルプ表示 |
| `Ctrl+C` | 終了 |
| `Backspace` | 文字削除 |
| `←→` | カーソル移動 |

## 📝 入力モード

### Readlineモード（デフォルト）
- シンプルな1行入力
- 短いメッセージに最適
- Enterで即座に送信
- Ctrl+Jで改行挿入（複数行メッセージ作成可能）
- @メンション補完機能
- `/edit <番号>` でメッセージ編集
- `/rm <番号>` でメッセージ削除

### Editorモード（Ctrl+E）
- vim/nano等のお好みのエディタを起動
- 長文メッセージに最適
- 複数行編集可能
- 保存して終了で送信、保存せず終了でキャンセル

### チャット中のコマンド
- `/` + 番号 - 指定した番号のスレッドに移動（例: `/5`）
- `/prev` or `/p` - 前日の履歴を表示（チャンネルのみ）
- `/next` or `/n` - 次の日の履歴を表示（チャンネルのみ）
- `/date <YYYY-MM-DD>` or `/d` - 指定した日付の履歴を表示（チャンネルのみ）
- `/today` - 今日の履歴に戻る（チャンネルのみ）
- `/history` or `/h` - 過去の履歴を表示（デフォルト20件）
- `/back` or `/b` - スレッドからチャンネルに戻る
- `/r` or `/recent` - 今日の会話履歴を表示（番号でチャンネル/スレッドに移動可能）
- `/delete <番号>` or `/del <番号>` - /recentモード中に履歴削除（例: /delete 1 3 5）
- `/refresh` or `/sync` - 今日の投稿を検索して履歴に追加
- `/link [番号]` - メッセージリンクを表示（例: `/link 5`）
- `/edit <番号>` - 指定した番号のメッセージを編集（例: `/edit 5`）
- `/rm <番号>` - 指定した番号のメッセージを削除（例: `/rm 5`、複数指定可: `/rm 1 3 5`）
- `/auto` - 自動応答モードの切り替え（メンションに自動返信、文体自動学習）
- `/autoall` - 全メッセージ返信モードの切り替え
- `/style` - 学習済みの文体スタイルを表示
- `/styleclear` - 文体スタイルをクリア
- `/help` - チャット中のヘルプ表示
- `Ctrl+E` - エディタモードに切り替え
- `Ctrl+R` - 今日の会話履歴の表示/非表示をトグル
- `Ctrl+W` - ブラウザで開く
- `Ctrl+Enter` - メッセージ送信
- `Ctrl+C` - 終了

エディタの設定：`export EDITOR=nano` または `.env` に追加

## 🏗️ プロジェクト構造

```
slack-cli/
├── src/
│   ├── index.js              # エントリーポイント
│   ├── ai/
│   │   └── auto-reply.js     # 自動応答モジュール（OpenAI連携）
│   ├── api/
│   │   └── slack-client.js   # Slack APIクライアント
│   ├── commands/
│   │   ├── channels.js       # チャンネル一覧コマンド
│   │   └── thread.js         # スレッドチャットコマンド
│   ├── ui/
│   │   ├── readline-input.js # Readline入力モード
│   │   ├── editor-input.js   # Editor入力モード
│   │   └── thread-display.js # スレッドメッセージ表示
│   └── utils/
│       └── help.js           # ヘルプコマンド
├── .env.example              # 環境変数テンプレート
├── package.json              # Node.js設定
└── README.md                 # このファイル
```

## 🔧 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `SLACK_USER_TOKEN` | ユーザートークン（推奨） | はい* |
| `SLACK_BOT_TOKEN` | Botトークン | はい* |
| `EDITOR` | 外部エディタ（デフォルト：vim） | いいえ |
| `OPENAI_API_KEY` | OpenAI APIキー（自動応答機能用） | いいえ |
| `OPENAI_MODEL` | OpenAIモデル（デフォルト：gpt-4o-mini） | いいえ |

*User TokenまたはBot Tokenのどちらかが必須です

## 📄 ライセンス

ISC

## 🤝 貢献

IssueやPull Requestはお気軽にどうぞ！
