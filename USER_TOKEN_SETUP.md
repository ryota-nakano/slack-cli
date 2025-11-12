# User Token セットアップガイド

ユーザーとして投稿したい場合は、User Tokenが必要です。

## Bot Token と User Token の違い

| 特徴 | Bot Token | User Token |
|------|-----------|------------|
| 投稿者 | 🤖 Botアプリ名 | 👤 あなたのユーザー名 |
| トークン | `xoxb-...` | `xoxp-...` |
| 用途 | 自動化、Bot投稿 | ユーザーとして投稿 |
| スコープ | Bot Token Scopes | User Token Scopes |

## User Token の取得方法

### 1. Slack API ページにアクセス
https://api.slack.com/apps

### 2. あなたのアプリを選択
既存のアプリをクリック

### 3. OAuth & Permissions を開く
左側のメニューから「OAuth & Permissions」をクリック

### 4. User Token Scopes を追加

「User Token Scopes」セクションまでスクロールし、以下を追加:

✅ **必須スコープ (6つ)**

| スコープ名 | 説明 |
|----------|------|
| `channels:history` | パブリックチャンネルのメッセージ履歴を読む |
| `channels:read` | パブリックチャンネル一覧を取得 |
| `chat:write` | ユーザーとしてメッセージを送信 |
| `users:read` | ユーザー情報を取得 |
| `groups:history` | プライベートチャンネルのメッセージ履歴を読む |
| `groups:read` | プライベートチャンネル一覧を取得 |

**注意:** Bot Token Scopes ではなく、**User Token Scopes** に追加してください！

### 5. アプリを再インストール

スコープを追加すると、ページ上部に黄色いバナーが表示されます。
「reinstall your app」または「Reinstall to Workspace」をクリック

### 6. User OAuth Token を取得

再インストール後、「User OAuth Token」が表示されます（`xoxp-`で始まる）。
これを `.env` ファイルに追加:

```bash
SLACK_USER_TOKEN=xoxp-あなたのユーザートークン
```

## 使い方

### ユーザーとして投稿

```bash
# メッセージ送信
python slack_cli.py --user send C01234ABCDE "こんにちは"

# チャットモード
python slack_cli.py --user chat C01234ABCDE
```

### Botとして投稿（デフォルト）

```bash
# --user オプションなし
python slack_cli.py send C01234ABCDE "こんにちは"
python slack_cli.py chat C01234ABCDE
```

## 両方使う場合の .env 設定例

```bash
# ユーザーとして投稿
SLACK_USER_TOKEN=xoxp-your-user-token-here

# Botとして投稿
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
```

両方設定しておけば、`--user`オプションで切り替えられます。

## よくある質問

**Q: User Token と Bot Token、どちらを使うべき？**
A: 
- 普段のチャット、個人的な投稿 → User Token（あなたの名前で投稿）
- 自動化、通知、Bot的な投稿 → Bot Token（Bot名で投稿）

**Q: User Token だけで良いのでは？**
A: はい。ユーザーとして投稿したいだけなら、User Tokenのみでも使えます。

**Q: スコープはBot Token Scopesと同じ？**
A: はい、必要なスコープ名は同じですが、「User Token Scopes」に追加してください。

**Q: 既存のメッセージを編集・削除できる？**
A: User Tokenを使えば、自分が投稿したメッセージの編集・削除が可能です（将来の機能として追加予定）。
