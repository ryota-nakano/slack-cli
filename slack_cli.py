#!/usr/bin/env python3
"""
Slack CLI - UbuntuのCLIでSlackチャットができるツール
"""
import os
import sys
import time
from datetime import datetime
from dotenv import load_dotenv
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

# 環境変数を読み込む
load_dotenv()

class SlackCLI:
    def __init__(self):
        token = os.getenv("SLACK_BOT_TOKEN")
        if not token:
            print("エラー: SLACK_BOT_TOKENが設定されていません")
            print("環境変数を設定するか、.envファイルを作成してください")
            sys.exit(1)
        
        self.client = WebClient(token=token)
        self.user_cache = {}
    
    def handle_slack_error(self, e, context=""):
        """Slack APIエラーを処理"""
        error = e.response['error']
        print(f"\nエラー: {error}")
        
        if error == 'missing_scope':
            print("\n❌ 必要なスコープが不足しています。")
            print("\n【解決方法】")
            print("1. https://api.slack.com/apps にアクセス")
            print("2. あなたのアプリを選択")
            print("3. 左メニューから 'OAuth & Permissions' をクリック")
            print("4. 'Bot Token Scopes' に以下を追加:")
            print("   • channels:history - パブリックチャンネルの履歴を読む")
            print("   • channels:read - パブリックチャンネル一覧を取得")
            print("   • chat:write - メッセージを送信")
            print("   • users:read - ユーザー情報を取得")
            print("   • groups:history - プライベートチャンネルの履歴を読む")
            print("   • groups:read - プライベートチャンネル一覧を取得")
            print("5. ページ上部に表示される 'reinstall your app' をクリック")
            print("6. 新しいトークンを .env ファイルに設定\n")
        elif error == 'not_in_channel':
            print(f"\n❌ Botがチャンネルに参加していません。")
            print(f"\n【解決方法】")
            print(f"Slackアプリでチャンネルを開き、Botを招待してください:")
            print(f"  /invite @your-bot-name\n")
        elif error == 'channel_not_found':
            print(f"\n❌ チャンネルが見つかりません。")
            print(f"チャンネルIDを確認してください。")
            print(f"'python slack_cli.py list' でチャンネル一覧を確認できます。\n")
        else:
            print(f"詳細: {e.response.get('message', 'Unknown error')}\n")
        
    def get_user_name(self, user_id):
        """ユーザーIDから表示名を取得"""
        if user_id in self.user_cache:
            return self.user_cache[user_id]
        
        try:
            response = self.client.users_info(user=user_id)
            name = response["user"]["profile"].get("display_name") or response["user"]["name"]
            self.user_cache[user_id] = name
            return name
        except SlackApiError:
            return user_id
    
    def list_channels(self):
        """チャンネル一覧を表示"""
        try:
            print("チャンネル一覧を取得中...")
            response = self.client.conversations_list(
                types="public_channel,private_channel",
                exclude_archived=True,
                limit=200
            )
            
            channels = response["channels"]
            
            print("\n利用可能なチャンネル:")
            print("-" * 70)
            for channel in channels:
                member_count = channel.get("num_members", "?")
                is_member = "✓" if channel.get("is_member") else " "
                channel_type = "🔒" if channel.get("is_private") else "#"
                print(f"{is_member} {channel_type}{channel['name']:<20} ID: {channel['id']:<15} メンバー: {member_count}")
            print("-" * 70)
            print(f"合計: {len(channels)}チャンネル")
            print("✓ = Botが参加済み\n")
            
        except SlackApiError as e:
            self.handle_slack_error(e, "チャンネル一覧取得")
    
    def send_message(self, channel_id, text):
        """メッセージを送信"""
        try:
            response = self.client.chat_postMessage(
                channel=channel_id,
                text=text
            )
            print(f"✓ メッセージを送信しました (ts: {response['ts']})")
            
        except SlackApiError as e:
            self.handle_slack_error(e, "メッセージ送信")
    
    def get_channel_name(self, channel_id):
        """チャンネルIDから名前を取得"""
        try:
            response = self.client.conversations_info(channel=channel_id)
            return response["channel"]["name"]
        except SlackApiError:
            return channel_id
    
    def show_history(self, channel_id, limit=50):
        """チャンネルの履歴を表示"""
        try:
            channel_name = self.get_channel_name(channel_id)
            print(f"\n#{channel_name} の履歴 (最新{limit}件):")
            print("=" * 80)
            
            response = self.client.conversations_history(
                channel=channel_id,
                limit=limit
            )
            
            messages = reversed(response["messages"])
            
            for msg in messages:
                if msg.get("subtype") in ["channel_join", "channel_leave"]:
                    continue
                
                user_id = msg.get("user", "Unknown")
                user_name = self.get_user_name(user_id) if user_id != "Unknown" else "System"
                
                timestamp = float(msg["ts"])
                dt = datetime.fromtimestamp(timestamp)
                time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                
                text = msg.get("text", "")
                
                print(f"[{time_str}] {user_name}: {text}")
            
            print("=" * 80 + "\n")
            
        except SlackApiError as e:
            self.handle_slack_error(e, "履歴取得")
    
    def chat_mode(self, channel_id):
        """インタラクティブチャットモード"""
        try:
            channel_name = self.get_channel_name(channel_id)
            print(f"\n#{channel_name} でチャット開始")
            print("メッセージを入力してください。'/quit'で終了、'/history'で履歴表示")
            print("-" * 80)
            
            # 最新のタイムスタンプを取得
            response = self.client.conversations_history(channel=channel_id, limit=1)
            latest_ts = response["messages"][0]["ts"] if response["messages"] else "0"
            
            while True:
                try:
                    message = input(f"#{channel_name}> ").strip()
                    
                    if not message:
                        continue
                    
                    if message == "/quit":
                        print("チャットを終了します")
                        break
                    
                    if message == "/history":
                        self.show_history(channel_id, 20)
                        continue
                    
                    # メッセージを送信
                    self.send_message(channel_id, message)
                    
                    # 新しいメッセージをチェック
                    time.sleep(1)
                    response = self.client.conversations_history(
                        channel=channel_id,
                        oldest=latest_ts,
                        limit=10
                    )
                    
                    if response["messages"]:
                        for msg in reversed(response["messages"]):
                            if msg["ts"] > latest_ts:
                                user_id = msg.get("user", "Unknown")
                                if user_id != "Unknown":
                                    user_name = self.get_user_name(user_id)
                                    text = msg.get("text", "")
                                    dt = datetime.fromtimestamp(float(msg["ts"]))
                                    time_str = dt.strftime("%H:%M:%S")
                                    print(f"[{time_str}] {user_name}: {text}")
                        
                        latest_ts = response["messages"][0]["ts"]
                
                except KeyboardInterrupt:
                    print("\n\nチャットを終了します")
                    break
                except EOFError:
                    print("\n\nチャットを終了します")
                    break
                    
        except SlackApiError as e:
            self.handle_slack_error(e, "チャットモード")


def print_usage():
    """使い方を表示"""
    print("""
Slack CLI - 使い方

コマンド:
  list                     チャンネル一覧を表示
  send <channel_id> <text> メッセージを送信
  history <channel_id>     メッセージ履歴を表示
  chat <channel_id>        インタラクティブチャットモード

例:
  python slack_cli.py list
  python slack_cli.py send C01234ABCDE "こんにちは"
  python slack_cli.py history C01234ABCDE
  python slack_cli.py chat C01234ABCDE
""")


def main():
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    command = sys.argv[1]
    cli = SlackCLI()
    
    if command == "list":
        cli.list_channels()
    
    elif command == "send":
        if len(sys.argv) < 4:
            print("エラー: channel_idとメッセージを指定してください")
            print("例: python slack_cli.py send C01234ABCDE 'こんにちは'")
            sys.exit(1)
        
        channel_id = sys.argv[2]
        message = " ".join(sys.argv[3:])
        cli.send_message(channel_id, message)
    
    elif command == "history":
        if len(sys.argv) < 3:
            print("エラー: channel_idを指定してください")
            print("例: python slack_cli.py history C01234ABCDE")
            sys.exit(1)
        
        channel_id = sys.argv[2]
        cli.show_history(channel_id)
    
    elif command == "chat":
        if len(sys.argv) < 3:
            print("エラー: channel_idを指定してください")
            print("例: python slack_cli.py chat C01234ABCDE")
            sys.exit(1)
        
        channel_id = sys.argv[2]
        cli.chat_mode(channel_id)
    
    else:
        print(f"エラー: 不明なコマンド '{command}'")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()
