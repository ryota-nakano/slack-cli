# 🚀 クイックスタートガイド

## ユーザーとして投稿する最短手順

### 1. Slack APIページを開く
```
https://api.slack.com/apps
```

### 2. あなたのアプリ → OAuth & Permissions

### 3. User Token Scopesに以下を追加:
- channels:history
- channels:read
- chat:write
- users:read
- groups:history
- groups:read

### 4. Reinstall to Workspace ボタンをクリック

### 5. ページ上部の「User OAuth Token」(xoxp-...)をコピー

### 6. .envファイルに設定
```bash
SLACK_USER_TOKEN=xoxp-コピーしたトークン
```

### 7. 使ってみる！
```bash
source venv/bin/activate
python slack_cli.py --user chat チャンネルID
```

---

## トークンの場所（画面イメージ）

OAuth & Permissions ページの上部:

```
┌─────────────────────────────────────────────────┐
│ OAuth Tokens for Your Workspace                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ User OAuth Token            👈 これをコピー！    │
│ xoxp-123456789...                        [Copy] │
│                                                 │
│ Bot User OAuth Token                            │
│ xoxb-123456789...                        [Copy] │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## よくある間違い

❌ Bot Token Scopesに追加してしまう
   → ✅ User Token Scopesに追加する

❌ Bot User OAuth Token (xoxb-) をコピーしてしまう
   → ✅ User OAuth Token (xoxp-) をコピーする

❌ アプリを再インストールしていない
   → ✅ スコープ追加後、必ず再インストールする

---

## トラブルシューティング

### User OAuth Token が表示されない

**原因:** User Token Scopesを追加していない

**解決方法:**
1. ページを下にスクロール
2. 「User Token Scopes」セクションを探す（Bot Token Scopesの下）
3. スコープを追加
4. ページ上部の「Reinstall to Workspace」をクリック
5. ページ上部に戻って「User OAuth Token」を確認

### どのトークンをコピーすればいい？

- **User OAuth Token** (xoxp-...) → ユーザーとして投稿
- **Bot User OAuth Token** (xoxb-...) → Botとして投稿

両方コピーして.envに設定すれば、--userオプションで切り替えられます！

---

詳細な説明は [USER_TOKEN_SETUP.md](USER_TOKEN_SETUP.md) を参照してください。
