# CLAUDE.md - AI秘書プロジェクト

## プロジェクト概要
翔太さん（Getabako）のAI秘書。毎朝のブリーフィングと株式分析レポートを自動生成し、Discordに送信する。

## 起動時の自動アクション
このフォルダで Claude Code を起動した際は、以下を自動実行してください:
1. `/rcd` を実行して Remote Control の URL を Discord に送信する
2. 「Remote Control リンクを Discord に送りました。タスク管理は /done で行えます。」と伝える

## 技術スタック
- TypeScript + tsx
- googleapis / google-auth-library（Google Calendar）
- yahoo-finance2（株価データ）
- discord.js（Discord Bot）
- Gemini API（ブリーフィング文面生成）
- GitHub Actions で毎朝 JST 8:00 に自動実行

## コマンド
- `npm run send-brief` - ブリーフィング生成 → Discord Webhook 送信（GitHub Actions で使用）
- `npm run brief` - 朝のブリーフィング生成（コンソール出力）
- `npm run stock` - 株式レポート生成
- `npm run bot` - Discord Bot 起動
- `npm run setup-calendar` - Google Calendar OAuth初期設定

## カスタムコマンド
- `/done [番号]` - タスクを番号指定で完了にする（例: `/done 1,3,5`）
- `/rcd` - Remote Control の URL を Discord に送信する

## タスク管理
- タスクデータは `tasks.json` に保存
- ブリーフィングのタスク一覧には通し番号が付く
- ユーザーが `/done 1,3,5` と言えば対応するタスクが完了になる
- 7日以上前の未完了タスクは自動アーカイブ
- 重複タスクは自動削除

## コーディングルール
- 日本語コメント
- ESM（import/export）
- 型は `src/types.ts` に集約
- エラーは握りつぶさず、ログ出力してフォールバック
