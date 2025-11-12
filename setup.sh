#!/bin/bash
# セットアップスクリプト

echo "Slack CLI - セットアップを開始します..."
echo ""

# 仮想環境が存在するかチェック
if [ -d "venv" ]; then
    echo "✓ 仮想環境は既に存在します"
else
    echo "仮想環境を作成中..."
    python3 -m venv venv
    echo "✓ 仮想環境を作成しました"
fi

echo ""
echo "依存関係をインストール中..."
source venv/bin/activate
pip install -q -r requirements.txt

if [ $? -eq 0 ]; then
    echo "✓ 依存関係のインストールが完了しました"
else
    echo "✗ インストール中にエラーが発生しました"
    exit 1
fi

echo ""
echo "================================"
echo "セットアップ完了！"
echo "================================"
echo ""
echo "次のステップ:"
echo "1. Slack APIトークンを取得してください"
echo "   https://api.slack.com/apps"
echo ""
echo "2. .envファイルを作成してトークンを設定:"
echo "   cp .env.example .env"
echo "   # .envファイルを編集してトークンを設定"
echo ""
echo "3. 仮想環境を有効化:"
echo "   source venv/bin/activate"
echo ""
echo "4. 使い方を確認:"
echo "   python slack_cli.py"
echo ""
