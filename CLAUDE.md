# CLAUDE.md - AI秘書プロジェクト

## プロジェクト概要
翔太さん（Getabako）のAI秘書。毎朝のブリーフィングと株式分析レポートを自動生成し、Discordに送信する。

## 技術スタック
- TypeScript + tsx
- googleapis / google-auth-library（Google Calendar）
- yahoo-finance2（株価データ）
- OpenClaw cronで毎朝8時に実行

## コマンド
- `npm run brief` - 朝のブリーフィング生成
- `npm run stock` - 株式レポート生成
- `npm run setup-calendar` - Google Calendar OAuth初期設定

## コーディングルール
- 日本語コメント
- ESM（import/export）
- 型は `src/types.ts` に集約
- エラーは握りつぶさず、ログ出力してフォールバック
