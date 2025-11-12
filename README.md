# Slack CLI

🚀 **ターミナルで動作するSlackチャットクライアント（スレッド対応・メンション補完機能付き）**

## ✨ 特徴

- 💬 ターミナル上でインタラクティブなスレッドチャット
- 🏷️ @メンション自動補完（Tab/矢印キーで選択）
- 📝 2つの入力モード：Readline（デフォルト）& Editor（vim/nano）
- 🔄 リアルタイムメッセージ更新（2秒ごとにポーリング）
- 🎨 絵文字付きカラフルなUI
- ⚡ 自分の投稿も即座に反映
- 🌏 完全な日本語対応
- 💾 ユーザー情報キャッシュによる高速化

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
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `users:read`
   - `groups:history`
   - `groups:read`
5. ワークスペースにインストールしてトークンを `.env` にコピー

**推奨：** 自分の名前で投稿するにはUser Token（`SLACK_USER_TOKEN`）を使用してください

## 🚀 使い方

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

| キー | 動作 |
|-----|------|
| `Enter` | メッセージ送信 |
| `@` + 入力 | メンション補完 |
| `Tab` / `↑↓` | メンション候補選択 |
| `Ctrl+E` | 外部エディタ起動（vim/nano） |
| `Ctrl+C` | 終了 |
| `Backspace` | 文字削除 |
| `←→` | カーソル移動 |

## 📝 入力モード

### Readlineモード（デフォルト）
- シンプルな1行入力
- 短いメッセージに最適
- Enterで即座に送信
- @メンション補完機能

### Editorモード（Ctrl+E）
- vim/nano等のお好みのエディタを起動
- 長文メッセージに最適
- 複数行編集可能
- 保存して終了で送信、保存せず終了でキャンセル

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
