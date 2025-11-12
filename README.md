# Slack CLI

UbuntuのCLIでSlackチャットができるツールです。

## 機能

- チャンネル一覧の表示
- メッセージの送信
- メッセージの受信（履歴表示）
- リアルタイムメッセージの監視

## セットアップ

### 1. 依存関係のインストール

```bash
pip install -r requirements.txt
```

### 2. Slack APIトークンの取得

1. [Slack API](https://api.slack.com/apps)にアクセス
2. 新しいアプリを作成
3. OAuth & Permissionsから以下のスコープを追加：
   - `channels:history` - チャンネルのメッセージを読む
   - `channels:read` - チャンネル一覧を取得
   - `chat:write` - メッセージを送信
   - `users:read` - ユーザー情報を取得
4. アプリをワークスペースにインストール
5. Bot User OAuth Tokenをコピー

### 3. 環境変数の設定

```bash
export SLACK_BOT_TOKEN="xoxb-your-token-here"
```

または`.env`ファイルを作成：

```
SLACK_BOT_TOKEN=xoxb-your-token-here
```

## 使い方

### チャンネル一覧を表示

```bash
python slack_cli.py list
```

### メッセージを送信

```bash
python slack_cli.py send <channel_id> "メッセージ内容"
```

### メッセージ履歴を表示

```bash
python slack_cli.py history <channel_id>
```

### インタラクティブモード

```bash
python slack_cli.py chat <channel_id>
```

チャットモードでは、リアルタイムでメッセージを送受信できます。
`/quit`で終了します。

## ライセンス

MIT
