# Slack App スコープ設定ガイド

`missing_scope` エラーが出た場合の解決方法です。

## 手順

### 1. Slack API ページにアクセス
https://api.slack.com/apps

### 2. あなたのアプリを選択
作成したアプリをクリック

### 3. OAuth & Permissions を開く
左側のメニューから「OAuth & Permissions」をクリック

### 4. Bot Token Scopes を追加
「Bot Token Scopes」セクションまでスクロールし、以下のスコープを**全て**追加:

✅ **必須スコープ (6つ)**

| スコープ名 | 説明 |
|----------|------|
| `channels:history` | パブリックチャンネルのメッセージ履歴を読む |
| `channels:read` | パブリックチャンネル一覧を取得 |
| `chat:write` | メッセージを送信 |
| `users:read` | ユーザー情報を取得 |
| `groups:history` | プライベートチャンネルのメッセージ履歴を読む |
| `groups:read` | プライベートチャンネル一覧を取得 |

### 5. アプリを再インストール
スコープを追加すると、ページ上部に黄色いバナーが表示されます:
```
Your app's OAuth scopes have changed. Please reinstall your app.
```

「reinstall your app」または「Reinstall to Workspace」をクリック

### 6. 新しいトークンを取得
再インストール後、新しい「Bot User OAuth Token」が表示されます。
これを `.env` ファイルに設定:

```bash
SLACK_BOT_TOKEN=xoxb-新しいトークン
```

### 7. Botをチャンネルに招待
Slackアプリで使用するチャンネルを開き:
```
/invite @your-bot-name
```

## 確認方法

正しく設定できたか確認:

```bash
source venv/bin/activate
python slack_cli.py list
```

チャンネル一覧が表示されれば成功です！

## よくある質問

**Q: どのスコープが足りないかわかりますか？**
A: エラーメッセージに表示されますが、上記の6つを全て追加すれば確実です。

**Q: スコープを追加したのにエラーが出ます**
A: アプリの再インストールを忘れていませんか？また、`.env`ファイルのトークンを更新しましたか？

**Q: プライベートチャンネルだけ使いたい場合**
A: `groups:history` と `groups:read` は必須です。パブリックチャンネルを使わない場合でも、全てのスコープを追加することを推奨します。
