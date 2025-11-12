#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
from prompt_toolkit import prompt
from prompt_toolkit.key_binding import KeyBindings

# 環境変数を読み込む
load_dotenv()

class SlackCLI:
    def __init__(self, use_user_token=False):
        """
        Args:
            use_user_token: Trueの場合、ユーザーとして投稿（User Token使用）
                           Falseの場合、Botとして投稿（Bot Token使用）
        """
        if use_user_token:
            token = os.getenv("SLACK_USER_TOKEN")
            token_type = "SLACK_USER_TOKEN"
        else:
            token = os.getenv("SLACK_BOT_TOKEN")
            token_type = "SLACK_BOT_TOKEN"
        
        if not token:
            print(f"エラー: {token_type}が設定されていません")
            print("環境変数を設定するか、.envファイルを作成してください")
            if use_user_token:
                print("\nユーザーとして投稿するには User Token が必要です。")
                print("詳細は USER_TOKEN_SETUP.md を参照してください。")
            sys.exit(1)
        
        self.client = WebClient(token=token)
        self.user_cache = {}
        self.use_user_token = use_user_token
    
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
    
    def send_message(self, channel_id, text, thread_ts=None, quiet=False):
        """メッセージを送信"""
        try:
            kwargs = {
                "channel": channel_id,
                "text": text
            }
            
            if thread_ts:
                kwargs["thread_ts"] = thread_ts
                
            response = self.client.chat_postMessage(**kwargs)
            
            if not quiet:
                if thread_ts:
                    print(f"✓ スレッドに返信しました")
                    print(f"  メッセージID: {response['ts']}")
                    print(f"  スレッドID: {thread_ts}")
                else:
                    msg_ts = response['ts']
                    print(f"✓ メッセージを送信しました")
                    print(f"  メッセージID: {msg_ts}")
                    print(f"  💡 このメッセージにスレッドを作成: reply {channel_id} {msg_ts} \"返信\"")
            
            return response['ts']
            
        except SlackApiError as e:
            self.handle_slack_error(e, "メッセージ送信")
            return None
    
    def show_thread(self, channel_id, thread_ts, interactive=False):
        """スレッドの内容を表示、またはインタラクティブモード"""
        try:
            channel_name = self.get_channel_name(channel_id)
            
            def display_messages(messages, show_header=True):
                """メッセージを表示"""
                if show_header:
                    print(f"\n#{channel_name} のスレッドチャット (ID: {thread_ts})")
                    print("改行: Enter | 送信: Alt+Enter | 終了: Ctrl+C | Backspaceで改行削除可能")
                    print("=" * 80)
                
                reply_count = len(messages) - 1
                
                # 最新20件のみ表示（スクロールしすぎないように）
                display_messages_list = messages[-21:] if len(messages) > 21 else messages
                
                for i, msg in enumerate(display_messages_list):
                    if msg.get("subtype") in ["channel_join", "channel_leave"]:
                        continue
                    
                    user_id = msg.get("user", "Unknown")
                    user_name = self.get_user_name(user_id) if user_id != "Unknown" else "System"
                    
                    timestamp = float(msg["ts"])
                    dt = datetime.fromtimestamp(timestamp)
                    time_str = dt.strftime("%H:%M:%S")
                    
                    text = msg.get("text", "")
                    
                    # 全メッセージリストでの実際の番号
                    actual_index = messages.index(msg)
                    
                    if actual_index == 0:
                        prefix = "📌 [親]"
                    else:
                        prefix = f"  ↳ [{actual_index}]"
                    print(f"{prefix} [{time_str}] {user_name}: {text}")
                
                print("=" * 80)
                if len(messages) > 21:
                    print(f"💬 {reply_count}件中 最新20件を表示")
                else:
                    print(f"💬 合計 {reply_count} 件の返信")
            
            if not interactive:
                # 通常の表示モード
                print(f"\n#{channel_name} のスレッド (ID: {thread_ts}):")
                print("=" * 80)
                
                response = self.client.conversations_replies(
                    channel=channel_id,
                    ts=thread_ts
                )
                messages = response["messages"]
                reply_count = len(messages) - 1
                
                for i, msg in enumerate(messages):
                    if msg.get("subtype") in ["channel_join", "channel_leave"]:
                        continue
                    
                    user_id = msg.get("user", "Unknown")
                    user_name = self.get_user_name(user_id) if user_id != "Unknown" else "System"
                    
                    timestamp = float(msg["ts"])
                    dt = datetime.fromtimestamp(timestamp)
                    time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                    
                    text = msg.get("text", "")
                    
                    if i == 0:
                        prefix = "📌 [親]"
                    else:
                        prefix = f"  ↳ [{i}]"
                    print(f"{prefix} [{time_str}] {user_name}: {text}")
                
                print("=" * 80)
                print(f"💬 合計 {reply_count} 件の返信")
                print(f"💬 インタラクティブモード: thread {channel_id} {thread_ts}\n")
                return
            
            # インタラクティブモード
            import threading
            import queue
            import os
            
            # 初回取得
            response = self.client.conversations_replies(
                channel=channel_id,
                ts=thread_ts
            )
            messages = response["messages"]
            latest_ts = messages[-1]["ts"] if messages else thread_ts
            
            # 初回表示
            display_messages(messages, show_header=True)
            print(f"\n💬 入力待ち...\n")
            
            # 入力用のキュー
            input_queue = queue.Queue()
            stop_input_thread = threading.Event()
            
            def input_thread():
                """別スレッドで入力を受け付ける（複数行対応 - prompt_toolkit使用）"""
                from prompt_toolkit.filters import Condition
                
                # キーバインディングを設定
                kb = KeyBindings()
                
                # multiline条件
                multiline_condition = Condition(lambda: True)
                
                @kb.add('enter', filter=multiline_condition)
                def _(event):
                    """Enterで改行（マルチラインモード時）"""
                    event.current_buffer.insert_text('\n')
                
                @kb.add('escape', 'enter')  # Alt+Enter
                def _(event):
                    """Alt+Enterで送信"""
                    event.current_buffer.validate_and_handle()
                
                while not stop_input_thread.is_set():
                    try:
                        # prompt_toolkitで複数行入力
                        message = prompt(
                            '> ',
                            multiline=multiline_condition,
                            key_bindings=kb,
                        )
                        
                        if message and message.strip():
                            input_queue.put(message)
                            
                    except KeyboardInterrupt:
                        # Ctrl+C = 終了
                        input_queue.put('/quit')
                        break
                    except EOFError:
                        # Ctrl+D = 終了
                        input_queue.put('/quit')
                        break
                    except Exception:
                        pass
            
            # 入力スレッドを開始
            t = threading.Thread(target=input_thread, daemon=True)
            t.start()
            
            last_check = time.time()
            needs_refresh = False
            
            try:
                while True:
                    # 新しいメッセージをチェック（2秒ごと）
                    if time.time() - last_check >= 2:
                        response = self.client.conversations_replies(
                            channel=channel_id,
                            ts=thread_ts
                        )
                        
                        new_msgs = response["messages"]
                        if len(new_msgs) > len(messages) or (new_msgs and new_msgs[-1]["ts"] != latest_ts):
                            messages = new_msgs
                            latest_ts = new_msgs[-1]["ts"]
                            needs_refresh = True
                        
                        last_check = time.time()
                    
                    # 入力をチェック
                    try:
                        message = input_queue.get_nowait()
                        
                        if message == "/quit":
                            print("\nスレッドチャットを終了します")
                            break
                        
                        if message.strip():
                            # メッセージを送信（quiet=Trueで確認メッセージなし）
                            sent_ts = self.send_message(channel_id, message, thread_ts=thread_ts, quiet=True)
                            if sent_ts:
                                # すぐに再取得して画面リフレッシュ
                                time.sleep(0.3)  # API反映待ち
                                response = self.client.conversations_replies(
                                    channel=channel_id,
                                    ts=thread_ts
                                )
                                messages = response["messages"]
                                latest_ts = messages[-1]["ts"]
                                needs_refresh = True
                        
                    except queue.Empty:
                        pass
                    
                    # 画面更新
                    if needs_refresh:
                        # 画面をクリア
                        os.system('clear' if os.name != 'nt' else 'cls')
                        
                        # 再描画
                        display_messages(messages, show_header=True)
                        print(f"\n💬 入力待ち...\n")
                        
                        needs_refresh = False
                    
                    time.sleep(0.1)
                    
            except KeyboardInterrupt:
                stop_input_thread.set()
                print("\n\nスレッドチャットを終了します")
                return
            finally:
                stop_input_thread.set()
            
        except SlackApiError as e:
            self.handle_slack_error(e, "スレッド取得")
    
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
            
            msg_number = 1
            for msg in messages:
                if msg.get("subtype") in ["channel_join", "channel_leave"]:
                    continue
                
                user_id = msg.get("user", "Unknown")
                user_name = self.get_user_name(user_id) if user_id != "Unknown" else "System"
                
                timestamp = float(msg["ts"])
                dt = datetime.fromtimestamp(timestamp)
                time_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                
                text = msg.get("text", "")
                
                # スレッド情報を表示
                thread_info = ""
                if msg.get("thread_ts"):
                    reply_count = msg.get("reply_count", 0)
                    if reply_count > 0:
                        thread_info = f" 💬 {reply_count}件の返信"
                
                # メッセージ番号を表示
                print(f"[{msg_number}] [{time_str}] {user_name}: {text}{thread_info}")
                
                # スレッドIDを表示
                if msg.get("thread_ts") and msg.get("reply_count", 0) > 0:
                    thread_ts_display = msg['ts']
                    print(f"     └─ 💬 スレッドID: {thread_ts_display}")
                    print(f"     └─ 📋 コマンド: thread {channel_id} {thread_ts_display}")
                    print(f"     └─ 📝 返信: reply {channel_id} {thread_ts_display} \"メッセージ\"")
                
                msg_number += 1
            
            print("=" * 80 + "\n")
            
        except SlackApiError as e:
            self.handle_slack_error(e, "履歴取得")
    
    def chat_mode(self, channel_id, thread_ts=None):
        """インタラクティブチャットモード"""
        try:
            channel_name = self.get_channel_name(channel_id)
            
            if thread_ts:
                print(f"\n#{channel_name} のスレッドでチャット開始")
                print(f"スレッドID: {thread_ts}")
                print("メッセージ入力 | 終了: /quit | 表示: /thread")
                print("-" * 80)
                # スレッドの内容を表示
                self.show_thread(channel_id, thread_ts)
            else:
                print(f"\n#{channel_name} でチャット開始")
                print("メッセージ入力 | 終了: /quit | 履歴: /history")
                print("-" * 80)
            
            # 最新のタイムスタンプを取得
            response = self.client.conversations_history(channel=channel_id, limit=1)
            latest_ts = response["messages"][0]["ts"] if response["messages"] else "0"
            
            while True:
                try:
                    prompt = f"#{channel_name}[スレッド]> " if thread_ts else f"#{channel_name}> "
                    message = input(prompt).strip()
                    
                    if not message:
                        continue
                    
                    if message == "/quit":
                        print("チャットを終了します")
                        break
                    
                    if message == "/history":
                        self.show_history(channel_id, 20)
                        continue
                    
                    if message == "/thread" and thread_ts:
                        self.show_thread(channel_id, thread_ts)
                        continue
                    
                    # /reply コマンドでスレッドモードに切り替え
                    if message.startswith("/reply ") and not thread_ts:
                        parts = message.split(maxsplit=1)
                        if len(parts) == 2:
                            new_thread_ts = parts[1]
                            print(f"スレッドモードに切り替えます: {new_thread_ts}")
                            self.chat_mode(channel_id, thread_ts=new_thread_ts)
                            return
                        continue
                    
                    # メッセージを送信
                    self.send_message(channel_id, message, thread_ts=thread_ts)
                    
                    # 新しいメッセージをチェック
                    time.sleep(1)
                    
                    if thread_ts:
                        # スレッドモードの場合はスレッド内のメッセージをチェック
                        response = self.client.conversations_replies(
                            channel=channel_id,
                            ts=thread_ts,
                            oldest=latest_ts,
                            limit=10
                        )
                    else:
                        # 通常モードの場合はチャンネルのメッセージをチェック
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
                                    prefix = "  ↳" if thread_ts else ""
                                    
                                    # スレッド情報を追加
                                    thread_info = ""
                                    if not thread_ts and msg.get("thread_ts") and msg.get("reply_count", 0) > 0:
                                        reply_count = msg.get("reply_count")
                                        thread_info = f" 💬 {reply_count}件"
                                    
                                    print(f"{prefix}[{time_str}] {user_name}: {text}{thread_info}")
                                    
                                    # スレッドIDを表示（通常モードのみ）
                                    if not thread_ts and msg.get("thread_ts") and msg.get("reply_count", 0) > 0:
                                        print(f"  └─ スレッド: /reply {msg['ts']}")
                        
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
  list                          チャンネル一覧を表示
  send <channel_id> <text>      メッセージを送信
  reply <channel_id> <thread_ts> <text>  スレッドに1回返信
  thread <channel_id> <thread_ts>        スレッドチャット（返信+リアルタイム更新）
  history <channel_id>          メッセージ履歴を表示
  chat <channel_id>             インタラクティブチャットモード

オプション:
  --user                        ユーザーとして投稿（デフォルト: Botとして投稿）

例:
  # 基本的な使い方
  python slack_cli.py list
  python slack_cli.py send C01234ABCDE "こんにちは"
  python slack_cli.py history C01234ABCDE
  
  # スレッド機能
  python slack_cli.py thread C01234ABCDE 1234567890.123456  # 返信しながらリアルタイム監視
  python slack_cli.py reply C01234ABCDE 1234567890.123456 "1回だけ返信"
  
  # ユーザーとして投稿
  python slack_cli.py --user send C01234ABCDE "こんにちは"
  python slack_cli.py --user thread C01234ABCDE 1234567890.123456
  
  # チャットモード
  python slack_cli.py chat C01234ABCDE
  python slack_cli.py --user chat C01234ABCDE
""")


def main():
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(1)
    
    # オプションをチェック
    use_user_token = False
    args = sys.argv[1:]
    
    if "--user" in args:
        use_user_token = True
        args.remove("--user")
    
    if len(args) < 1:
        print_usage()
        sys.exit(1)
    
    command = args[0]
    cli = SlackCLI(use_user_token=use_user_token)
    
    # トークンタイプを表示
    token_type = "👤 ユーザー" if use_user_token else "🤖 Bot"
    if command != "list":
        print(f"モード: {token_type}\n")
    
    if command == "list":
        cli.list_channels()
    
    elif command == "send":
        if len(args) < 3:
            print("エラー: channel_idとメッセージを指定してください")
            print("例: python slack_cli.py send C01234ABCDE 'こんにちは'")
            sys.exit(1)
        
        channel_id = args[1]
        message = " ".join(args[2:])
        cli.send_message(channel_id, message)
    
    elif command == "reply":
        if len(args) < 4:
            print("エラー: channel_id、thread_ts、メッセージを指定してください")
            print("例: python slack_cli.py reply C01234ABCDE 1234567890.123456 'スレッドに返信'")
            sys.exit(1)
        
        channel_id = args[1]
        thread_ts = args[2]
        message = " ".join(args[3:])
        cli.send_message(channel_id, message, thread_ts=thread_ts)
    
    elif command == "thread":
        if len(args) < 3:
            print("エラー: channel_idとthread_tsを指定してください")
            print("例: python slack_cli.py thread C01234ABCDE 1234567890.123456")
            sys.exit(1)
        
        channel_id = args[1]
        thread_ts = args[2]
        # デフォルトでインタラクティブモード
        cli.show_thread(channel_id, thread_ts, interactive=True)
    
    elif command == "history":
        if len(args) < 2:
            print("エラー: channel_idを指定してください")
            print("例: python slack_cli.py history C01234ABCDE")
            sys.exit(1)
        
        channel_id = args[1]
        cli.show_history(channel_id)
    
    elif command == "chat":
        if len(args) < 2:
            print("エラー: channel_idを指定してください")
            print("例: python slack_cli.py chat C01234ABCDE")
            sys.exit(1)
        
        channel_id = args[1]
        cli.chat_mode(channel_id)
    
    else:
        print(f"エラー: 不明なコマンド '{command}'")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()
