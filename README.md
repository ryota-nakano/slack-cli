# Slack CLI

UbuntuのCLIでSlackチャットができるツールです。

## ⚠️ よくある質問

### Bot vs ユーザーとして投稿

- **デフォルト（Bot Token）**: 🤖 Botアプリ名で投稿
- **--user オプション（User Token）**: 👤 あなたのユーザー名で投稿

📖 **ユーザーとして投稿したい場合:**
- 最短手順: [QUICKSTART.md](QUICKSTART.md) ⚡
- 詳細説明: [USER_TOKEN_SETUP.md](USER_TOKEN_SETUP.md) 📚

### エラーが出た場合

`missing_scope` エラーが出た場合は、[SCOPE_SETUP.md](SCOPE_SETUP.md) を参照してください。

## クイックスタート

```bash
# 1. セットアップスクリプトを実行
./setup.sh

# 2. .envファイルを作成してSlack APIトークンを設定
cp .env.example .env
# .envファイルを編集して、SLACK_BOT_TOKENを設定

# 3. 仮想環境を有効化
source venv/bin/activate

# 4. 使ってみる
python slack_cli.py list
```

**💡 日本語入力のヒント:**
- Backspaceで文字を削除できます
- 矢印キー（↑↓←→）でカーソル移動できます
- Ctrl+Cで終了できます

## 機能

- チャンネル一覧の表示
- メッセージの送信
- **スレッドへの返信** 🆕
- **スレッドチャット（返信+リアルタイム監視）** 🆕🔥
- メッセージの受信（履歴表示）
- リアルタイムメッセージの監視
- インタラクティブチャットモード（スレッド対応、リアルタイム更新）

## セットアップ

### 1. 仮想環境の作成と依存関係のインストール

```bash
# 仮想環境を作成
python3 -m venv venv

# 仮想環境を有効化
source venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt
```

### 2. Slack APIトークンの取得

#### 詳細な手順:

1. **Slack Appを作成**
   - [Slack API](https://api.slack.com/apps)にアクセス
   - 「Create New App」をクリック
   - 「From scratch」を選択
   - App名とワークスペースを選択して「Create App」

2. **Bot Token Scopesを追加**
   - 左メニューから「OAuth & Permissions」を選択
   - 「Bot Token Scopes」セクションまでスクロール
   - 「Add an OAuth Scope」をクリックして以下を追加：
   
   **必須のスコープ:**
   ```
   channels:history    - パブリックチャンネルのメッセージ履歴を読む
   channels:read       - パブリックチャンネル一覧を取得
   chat:write          - メッセージを送信
   users:read          - ユーザー情報を取得
   groups:history      - プライベートチャンネルのメッセージ履歴を読む
   groups:read         - プライベートチャンネル一覧を取得
   ```

3. **アプリをワークスペースにインストール**
   - ページ上部の「Install to Workspace」をクリック
   - 権限を確認して「許可する」をクリック

4. **Bot User OAuth Tokenをコピー**
   - インストール後、「Bot User OAuth Token」が表示されます
   - `xoxb-`で始まるトークンをコピー

5. **Botをチャンネルに招待**
   - Slackアプリで使用するチャンネルを開く
   - `/invite @your-bot-name` を実行
   - または、チャンネル設定から「統合」→「アプリを追加」

### 3. 環境変数の設定

**ユーザーとして投稿する場合（推奨）:**
```bash
export SLACK_USER_TOKEN="xoxp-your-user-token-here"
```

**Botとして投稿する場合:**
```bash
export SLACK_BOT_TOKEN="xoxb-your-bot-token-here"
```

または`.env`ファイルを作成：

```
# ユーザーとして投稿
SLACK_USER_TOKEN=xoxp-your-user-token-here

# Botとして投稿（オプション）
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
```

## 使い方

**注意:** 仮想環境を有効化してから実行してください: `source venv/bin/activate`

### チャンネル一覧を表示

```bash
python slack_cli.py list
```

### メッセージを送信

```bash
# Botとして送信（デフォルト）
python slack_cli.py send <channel_id> "メッセージ内容"

# ユーザーとして送信
python slack_cli.py --user send <channel_id> "メッセージ内容"
```

### スレッドに返信 🆕

```bash
# 履歴からスレッドIDを確認
python slack_cli.py history <channel_id>

# 出力例:
# [1] [2024-01-15 10:30:45] Alice: 会議の議事録です 💬 3件の返信
#      └─ 💬 スレッドID: 1705282245.123456
#      └─ 📋 コマンド: thread C01234ABCDE 1705282245.123456
#      └─ 📝 返信: reply C01234ABCDE 1705282245.123456 "メッセージ"

# スレッドチャット（返信+リアルタイム監視） 🆕🔥
python slack_cli.py thread <channel_id> <thread_ts>
# → シンプルで分かりやすい操作！
# → 改行: Ctrl+J
# → 削除: Ctrl+H (Backspace)
# → 送信: Enter
# → 終了: Ctrl+C
# → 矢印キーで自由に移動
# → 複数行を自由に編集できる
# → 2秒ごとに新しい返信を自動表示
# → 画面を自動リフレッシュ
# → 自分の投稿もすぐに画面に反映！

# スレッドに1回だけ返信（確認メッセージあり）
python slack_cli.py reply <channel_id> <thread_ts> "返信内容"
# → スクリプトから使う時やサッと送信したい時に便利

# ユーザーとしてスレッドチャット
python slack_cli.py --user thread <channel_id> <thread_ts>
```

**スレッドIDは履歴表示で自動的に表示されます！**
コマンドもコピペできる形式で表示されるので、簡単に使えます。

**`thread`コマンドの特徴:**
- 💬 **シンプルで分かりやすい操作！**
- 📝 改行: `Ctrl+J`
- ⌫ 削除: `Ctrl+H` (Backspaceと同じ)
- 📤 送信: `Enter`
- 🛑 終了: `Ctrl+C` または `Ctrl+D`
- ⬆️⬇️⬅️➡️ **矢印キーで自由にカーソル移動**
- ✏️ **複数行を自由に編集**
- 🔄 2秒ごとに新しい返信を自動表示
- 🖥️ 画面を自動リフレッシュ（新しいメッセージが常に見やすい位置に）
- ⚡ 自分の投稿も0.3秒で画面に反映（確認メッセージなし）
- 📊 最新20件を表示（長すぎるスレッドも快適）
- 👥 他の人の返信もリアルタイムで見える

**入力例:**
```
> こんにちは！<Ctrl+J>
こんにちは！
質問があります。<Ctrl+J>
質問があります。
<Ctrl+J>

これについて教えてください<Enter>  ← 送信！
これについて教えてください
```

送信されるメッセージ:
```
こんにちは！
質問があります。

これについて教えてください
```

**便利な機能:**
- Ctrl+H で文字削除（**改行も削除できる！**）
- 矢印キー（↑↓←→）でカーソル移動（**どこでも移動可能！**）
- Ctrl+A で行頭、Ctrl+E で行末
- Ctrl+K でカーソルから行末まで削除
- Ctrl+U でカーソルから行頭まで削除
- 間違えたら自由に修正できる

**キーバインディング:**
- `Ctrl+J` - 改行
- `Ctrl+H` - 削除（Backspaceと同じ動作）
- `Enter` - 送信
- `Ctrl+C` - 終了

**`reply`コマンドとの違い:**
- `thread`: チャットモード、画面リフレッシュ、複数行編集
- `reply`: 1回だけ送信、確認メッセージあり、スクリプト向け

### メッセージ履歴を表示

```bash
python slack_cli.py history <channel_id>
```

履歴にスレッドがある場合、💬アイコンとスレッドIDが表示されます。

### インタラクティブモード

```bash
# 通常のチャット
python slack_cli.py chat <channel_id>

# ユーザーとしてチャット（あなたの名前で投稿）
python slack_cli.py --user chat <channel_id>
```

**チャットモード内のコマンド:**
- `/quit` - 終了
- `/history` - 履歴表示
- `/reply <thread_ts>` - スレッドモードに切り替え
- `/thread` - スレッド内容を表示（スレッドモード時）

**リアルタイム更新:**
- 通常チャット: 1秒ごとに新しいメッセージをチェック
- スレッドチャット（`thread`コマンド）: 2秒ごとに新しい返信をチェック、メッセージも送信可能

チャットモードでは、リアルタイムでメッセージを送受信できます。
`/quit`で終了します。

詳しくは [THREAD_GUIDE.md](THREAD_GUIDE.md) を参照してください。

## トラブルシューティング

### `missing_scope` エラー

**原因:** 必要なスコープが不足しています

**解決方法:**
1. https://api.slack.com/apps にアクセス
2. あなたのアプリを選択
3. 左メニューから「OAuth & Permissions」をクリック
4. 「Bot Token Scopes」に上記の6つのスコープが全て追加されているか確認
5. スコープを追加した場合は、ページ上部の「reinstall your app」をクリック
6. 新しいトークンを `.env` ファイルに反映

### `not_in_channel` エラー

**原因:** Botがチャンネルに参加していません

**解決方法:**
Slackアプリでチャンネルを開き、以下のいずれかの方法でBotを招待:
- `/invite @your-bot-name` を実行
- チャンネル詳細 → 統合 → アプリを追加

### `channel_not_found` エラー

**原因:** チャンネルIDが間違っているか、Botがアクセスできません

**解決方法:**
```bash
python slack_cli.py list
```
でチャンネルIDを確認してください。

## ライセンス

MIT
