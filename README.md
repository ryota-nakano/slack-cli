# Slack CLI

🚀 **ターミナルで動作するSlackチャットクライアント（スレッド対応・メンション補完機能付き）**

## ✨ 特徴

- 💬 ターミナル上でインタラクティブなスレッドチャット
- 🏷️ @メンション・グループメンション自動補完（Tab/矢印キーで選択）
- 🔍 チャンネル検索・補完（#で起動）
- 📜 今日の会話履歴からクイックアクセス（/rコマンド）
- 📝 2つの入力モード：Readline（デフォルト）& Editor（vim/nano）
- 🔄 リアルタイムメッセージ更新（2秒ごとにポーリング）
- ✅ 自動既読マーク機能
- 🎨 絵文字対応カラフルなUI
- ⚡ 自分の投稿も即座に反映
- 🌏 完全な日本語対応
- 💾 ユーザー・チャンネル情報キャッシュによる高速化
- 📅 デフォルトで今日の履歴のみ表示（/olderコマンドで過去も取得可能）

## 📦 インストール

```bash
# 依存関係をインストール
npm install

# 環境設定
cp .env.example .env
# .envを編集してSlackトークンを追加
```

## 🔑 Slackトークンのセットアップ

1. https://api.slack.com/apps にアクセス
2. 新しいアプリを作成するか既存のアプリを選択
3. "OAuth & Permissions" に移動
4. 必要なスコープを追加：
   - `channels:history` - チャンネルの履歴を読む
   - `channels:read` - チャンネル一覧を読む
   - `chat:write` - メッセージを送信
   - `users:read` - ユーザー情報を読む
   - `groups:history` - プライベートチャンネルの履歴を読む
   - `groups:read` - プライベートチャンネル一覧を読む
   - `usergroups:read` - ユーザーグループ（@developers等）の名前を表示 ⭐
5. ワークスペースにインストールしてトークンを `.env` にコピー

**推奨：** 自分の名前で投稿するにはUser Token（`SLACK_USER_TOKEN`）を使用してください

**Note:** `usergroups:read` スコープがない場合、グループメンションは `@<GROUP_ID>` 形式で表示されます

## 🚀 使い方

### グローバルコマンドとして使う（推奨）

どこからでも `slack` コマンドで起動できるようにする：

```bash
# プロジェクトルートで実行
npm run setup-global
```

これにより、どのディレクトリからでも以下のようにSlack CLIを起動できます：

```bash
# デフォルトでチャンネル選択画面が起動
slack

# チャンネル一覧を表示
slack channels

# 特定のチャンネルで起動
slack channel <channel_id>

# 特定のスレッドで起動
slack thread <channel_id> <thread_ts>
```

**注意:** グローバルコマンドをアンインストールする場合：
```bash
npm run unsetup-global
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

### チャット画面

| キー | 動作 |
|-----|------|
| `Ctrl+Enter` | メッセージ送信 |
| `Ctrl+J` | 改行挿入（複数行メッセージ） |
| `@` + 入力 + `Tab` | メンション・グループメンション補完 |
| `#` + 入力 + `Tab` | チャンネル検索・補完 |
| `Tab` / `↑↓` | 候補選択 |
| `Ctrl+E` | 外部エディタ起動（vim/nano） |
| `/` + 番号 | スレッドに移動（例: /5） |
| `/older` + 日数 | 過去の履歴を読み込む（例: /older 1で昨日、/older 7で1週間前） |
| `/back` | スレッドからチャンネルに戻る |
| `/r` | 今日の会話履歴を表示 |
| `/cancel` | 履歴選択モードを解除 |
| `/rm <番号>` | メッセージ削除（例: /rm 5） |
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
- `/rm <番号>` でメッセージ削除

### Editorモード（Ctrl+E）
- vim/nano等のお好みのエディタを起動
- 長文メッセージに最適
- 複数行編集可能
- 保存して終了で送信、保存せず終了でキャンセル

### チャット中のコマンド
- `/` + 番号 - 指定した番号のスレッドに移動（例: `/5`）
- `/older <日数>` - 過去の履歴を読み込む（例: `/older 1`で昨日、`/older 7`で1週間前まで）
- `/back` - スレッドからチャンネルに戻る
- `/r` - 今日の会話履歴を表示（番号でチャンネル/スレッドに移動可能）
- `/cancel` - 履歴選択モードを解除
- `/rm <番号>` - 指定した番号のメッセージを削除（例: `/rm 5`）
- `/help` - チャット中のヘルプ表示
- `Ctrl+E` - エディタモードに切り替え
- `Ctrl+Enter` - メッセージ送信
- `Ctrl+C` - 終了

エディタの設定：`export EDITOR=nano` または `.env` に追加

## 🏗️ プロジェクト構造

```
slack-cli/
├── src/
│   ├── index.js              # エントリーポイント
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

*User TokenまたはBot Tokenのどちらかが必須です

## 📄 ライセンス

ISC

## 🤝 貢献

IssueやPull Requestはお気軽にどうぞ！
