# Slack CLI

UbuntuのCLIでSlackチャットができるツールです。

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

## 機能

- チャンネル一覧の表示
- メッセージの送信
- メッセージの受信（履歴表示）
- リアルタイムメッセージの監視

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

```bash
export SLACK_BOT_TOKEN="xoxb-your-token-here"
```

または`.env`ファイルを作成：

```
SLACK_BOT_TOKEN=xoxb-your-token-here
```

## 使い方

**注意:** 仮想環境を有効化してから実行してください: `source venv/bin/activate`

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
