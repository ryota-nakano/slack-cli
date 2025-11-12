# User Token セットアップガイド

ユーザーとして投稿したい場合は、User Tokenが必要です。

## 🎯 User Tokenの取得場所

**簡単に言うと:**
https://api.slack.com/apps → あなたのアプリ → OAuth & Permissions → ページ上部の「User OAuth Token」

---

## Bot Token と User Token の違い

| 特徴 | Bot Token | User Token |
|------|-----------|------------|
| 投稿者 | 🤖 Botアプリ名 | 👤 あなたのユーザー名 |
| トークン | `xoxb-...` | `xoxp-...` |
| 用途 | 自動化、Bot投稿 | ユーザーとして投稿 |
| スコープ | Bot Token Scopes | User Token Scopes |
| 取得場所 | OAuth & Permissions → Bot User OAuth Token | OAuth & Permissions → User OAuth Token |

---

## 📍 詳細な取得手順

### ステップ1: Slack API ページにアクセス

```
https://api.slack.com/apps
```

ブラウザで上記URLを開きます。

### ステップ2: アプリを選択

- 既存のアプリをクリック
- または「Create New App」で新規作成

### ステップ3: OAuth & Permissions を開く

左側のメニューから「**OAuth & Permissions**」をクリック

### ステップ4: User Token Scopes を追加

1. ページを下にスクロール
2. 「**User Token Scopes**」セクションを探す（Bot Token Scopesの下にあります）
3. 「Add an OAuth Scope」をクリックして以下を**全て**追加:

```
✅ channels:history  - パブリックチャンネルのメッセージ履歴を読む
✅ channels:read     - パブリックチャンネル一覧を取得
✅ chat:write        - ユーザーとしてメッセージを送信
✅ users:read        - ユーザー情報を取得
✅ groups:history    - プライベートチャンネルのメッセージ履歴を読む
✅ groups:read       - プライベートチャンネル一覧を取得
```

**⚠️ 重要:** 「Bot Token Scopes」ではなく、「**User Token Scopes**」に追加してください！

### ステップ5: アプリを再インストール

スコープを追加すると、ページ上部に黄色いバナーが表示されます:

```
⚠️ Your app's OAuth scopes have changed. 
   Please reinstall your app.
   [Reinstall to Workspace]
```

「**Reinstall to Workspace**」ボタンをクリック

### ステップ6: 権限を確認

表示される権限リクエスト画面で:
- あなたのワークスペースを選択
- 権限内容を確認
- 「**許可する**」をクリック

### ステップ7: User OAuth Token をコピー

インストール完了後、同じ「OAuth & Permissions」ページの上部に戻ると:

```
┌────────────────────────────────────────────────────┐
│ OAuth Tokens for Your Workspace                    │
├────────────────────────────────────────────────────┤
│                                                    │
│ User OAuth Token                    👈 これ！      │
│ xoxp-1234567890123-1234567890123-123456...  [Copy] │
│                                                    │
│ Bot User OAuth Token                               │
│ xoxb-1234567890123-1234567890123-123456...  [Copy] │
│                                                    │
└────────────────────────────────────────────────────┘
```

**「User OAuth Token」**（`xoxp-`で始まる）の「Copy」ボタンをクリック

### ステップ8: .env ファイルに設定

プロジェクトルートの `.env` ファイルに追加:

```bash
SLACK_USER_TOKEN=xoxp-コピーしたトークン
```

例:
```bash
SLACK_USER_TOKEN=xoxp-1234567890123-1234567890123-abcdefghijklmnopqrstuvwx
```

---

## 🚀 使い方

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
