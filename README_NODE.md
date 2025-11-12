# 📱 Slack CLI - Node.js版

UbuntuのCLIでSlackチャットができるツールです（Node.js実装）。

Python版と同等の機能を持つ高機能版です！

## 🎯 特徴

✨ **Node.js実装の利点**
- 📦 npmで簡単インストール
- 🚀 非同期処理がネイティブ
- 💚 Node.jsエコシステムを活用
- 📝 JavaScriptで実装

✨ **全機能実装済み**
- 💬 スレッドでインタラクティブチャット
- 📝 複数行編集（Ctrl+J で改行）
- ⌫ Ctrl+H で削除（改行も削除可能）
- 📤 Enter で送信
- 🏷️ @でメンション補完
- 🔄 2秒ごとにリアルタイム更新
- 🖥️ 画面自動リフレッシュ
- ⚡ 自分の投稿も即座に反映
- 🎨 カラフルな表示
- 🌏 日本語完全対応

## 📦 インストール

```bash
# 依存関係をインストール（既にインストール済み）
npm install

# または手動で
npm install @slack/web-api dotenv blessed blessed-contrib chalk
```

## 🚀 使い方

### 1. チャンネル一覧

```bash
node slack-cli.js channels
```

または

```bash
npm run channels
```

### 2. スレッドチャット（インタラクティブモード）

```bash
node slack-cli.js thread <channel_id> <thread_ts>
```

**例:**
```bash
node slack-cli.js thread C03BMM307B5 1762907616.178439
```

## ⌨️ キーバインディング

**基本操作:**
- 普通に入力 - 文字入力
- `Ctrl+J` - 改行
- `Ctrl+H` - 削除（Backspaceと同じ）
- `Enter` - 送信
- `@名前` + `Tab` - メンション候補選択
- `Ctrl+C` - 終了

**メンション:**
1. `@`を入力
2. 名前の一部を入力
3. `Tab`で候補選択
4. 自動的に`<@USER_ID>`形式に変換

**例:**
```
> @ryo<Tab>
→ "<@U12345678>"
```

## 🔧 環境変数

`.env`ファイルに以下を設定（Python版と共通）：

```bash
# ユーザートークン（推奨）
SLACK_USER_TOKEN=xoxp-your-token-here

# または Botトークン
SLACK_BOT_TOKEN=xoxb-your-token-here
```

## 📊 Python版との比較

| 機能 | Python版 | Node.js版 |
|------|----------|-----------|
| チャンネル一覧 | ✅ | ✅ |
| スレッドチャット | ✅ | ✅ |
| 複数行編集 | ✅ | ✅ |
| メンション補完 | ✅ | ✅ |
| リアルタイム更新 | ✅ | ✅ |
| 日本語対応 | ✅ | ✅ |
| インストール | venv必要 | npm install |
| 起動速度 | 普通 | 速い |
| メモリ使用量 | 少ない | 普通 |

## 🎨 画面イメージ

```
#真エンジニア [スレッド] | メンバー: 15人 | Enter: 送信 | Ctrl+J: 改行 | Ctrl+C: 終了
================================================================================

📌 [1] [11-12 15:23:53] ﾘｮーﾀ: こっちか
  ↳ [2] [11-12 15:25:10] ﾘｮーﾀ: 2倍にして音をよくしたらこれでもいい説
  ↳ [3] [11-12 15:26:28] ﾘｮーﾀ: featuresなのかこれは　笑
  ↳ [4] [11-12 15:27:58] George: specialだと思います

================================================================================
💬 合計 4 件の返信

> _
```

## 🛠️ 技術スタック

- **Slack API**: `@slack/web-api`
- **TUI**: `blessed`
- **カラー表示**: `chalk`
- **環境変数**: `dotenv`

## 📝 ファイル構成

```
slack-cli/
├── slack-cli.js          # Node.js版メインファイル
├── slack_cli.py          # Python版メインファイル
├── package.json          # Node.js依存関係
├── requirements.txt      # Python依存関係
├── .env                  # 環境変数（共通）
├── README.md             # Python版ドキュメント
├── README_NODE.md        # Node.js版ドキュメント（このファイル）
└── venv/                 # Python仮想環境
```

## 🎯 どちらを使うべき？

**Node.js版を選ぶ理由:**
- ✅ Node.jsの知識がある
- ✅ JavaScriptエコシステムを好む
- ✅ npmでパッケージ管理したい
- ✅ 起動速度を重視

**Python版を選ぶ理由:**
- ✅ Pythonの知識がある
- ✅ Pythonエコシステムを好む
- ✅ メモリ使用量を抑えたい
- ✅ prompt_toolkitの高度な機能を使いたい

**どちらも同等の機能を持っているので、好みで選んでOK！** 🎉

## 🐛 トラブルシューティング

### chalk関連のエラー

```
Error [ERR_REQUIRE_ESM]: require() of ES Module
```

→ chalk v5はESM専用です。CommonJSで使う場合はv4を使用：

```bash
npm install chalk@4
```

または、`slack-cli.js`を`slack-cli.mjs`にリネームしてESMで使用。

### 環境変数が読み込まれない

```bash
# .envファイルが正しく設定されているか確認
cat .env

# トークンが設定されているか確認
node -e "require('dotenv').config(); console.log(process.env.SLACK_USER_TOKEN ? '✓ 設定済み' : '✗ 未設定')"
```

## 📄 ライセンス

ISC

## 🙏 謝辞

- Slack Web API
- Blessed TUI library
- Python版の実装を参考にしました

---

**🎉 Node.js版も完璧に動作します！**

両方のバージョンを試して、お好みの方を使ってください！✨
