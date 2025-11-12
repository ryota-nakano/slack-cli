# 🚀 クイックスタートガイド

3分でSlack CLIを始めよう！

## ステップ1: インストール

```bash
npm install
```

## ステップ2: Slackトークンのセットアップ

### オプションA: クイックセットアップ（推奨）

1. https://api.slack.com/apps にアクセス
2. 「Create New App」→「From scratch」をクリック
3. 名前を「CLI Chat」にしてワークスペースを選択
4. サイドバーの「OAuth & Permissions」に移動
5. 「Scopes」までスクロールして以下の**User Token Scopes**を追加：
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `users:read`
   - `groups:history`
   - `groups:read`
6. 上部の「Install to Workspace」をクリック
7. **User OAuth Token**（`xoxp-`で始まる）をコピー

### オプションB: 既存のアプリを使用

既にSlackアプリがある場合：
1. アプリの設定に移動
2. OAuth & Permissions → Scopesを確認（不足しているスコープを追加）
3. 必要に応じてワークスペースに再インストール
4. トークンをコピー

## ステップ3: 設定

```bash
cp .env.example .env
```

`.env`を編集してトークンを追加：
```
SLACK_USER_TOKEN=xoxp-your-token-here
```

## ステップ4: 試してみよう！

### チャンネル一覧
```bash
npm run channels
```

### スレッドでチャット開始
```bash
node src/index.js thread <channel_id> <thread_ts>
```

**channel_idとthread_tsの取得方法は？**
1. SlackのWeb版またはデスクトップ版を開く
2. スレッド内のメッセージをクリック
3. 「⋮」（三点リーダー）→「リンクをコピー」をクリック
4. URLは次のような形式：`https://workspace.slack.com/archives/C03BMM307B5/p1762907616178439`
5. 次のように抽出：
   - `channel_id` = `C03BMM307B5`
   - `thread_ts` = `1762907616.178439`（10桁目の後にドットを追加：`1762907616` → `1762907616.178439`）

## 🎉 準備完了！

### クイックヒント

- **短いメッセージ**: そのまま入力してEnterを押す
- **長いメッセージ**: `Ctrl+E`でvim/nanoを開く
- **メンション**: `@`を入力してTab/↑↓で選択
- **終了**: `Ctrl+C`を押す

さらに詳しい情報は [README.md](README.md) をご覧ください！
