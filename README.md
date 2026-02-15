# 🤖 AI秘書 (ai-secretary)

翔太さん専用のAI秘書システム。毎朝のタスクブリーフィングとAI銘柄の株式分析レポートを自動生成し、Discordに送信します。

## 🏗 アーキテクチャ

```
Google Calendar ──→ calendar.ts ──→ taskAnalyzer.ts ──→ morningBrief.ts ──→ Discord
                                                                              ↑
Yahoo Finance  ──→ stockReport.ts ────────────────────────────────────────────┘
```

### 処理フロー
1. **カレンダー取得** - Google Calendar APIで今日/今週/今月の予定を取得
2. **タスク分析** - 予定をカテゴリ・優先度別のタスクに変換 + 定常業務を追加
3. **ブリーフィング生成** - タスクを優先度順にソートし、Discord送信用メッセージを生成
4. **株式レポート** - AI銘柄の株価データを取得し、分析レポートを生成
5. **Discord送信** - OpenClaw経由でDiscordチャンネルに送信

## 📁 プロジェクト構成

```
ai-secretary/
├── src/
│   ├── calendar.ts      # Google Calendar API連携
│   ├── taskAnalyzer.ts  # 予定→タスク変換エンジン
│   ├── morningBrief.ts  # 朝のブリーフィング生成
│   ├── stockReport.ts   # 株式分析レポート生成
│   └── types.ts         # 型定義
├── prompts/
│   ├── taskAnalysis.md  # タスク分析プロンプト
│   └── stockReport.md   # 株レポートプロンプト
├── scripts/
│   └── setup-calendar.ts # Google Calendar OAuth設定
├── .env.example         # 環境変数テンプレート
└── package.json
```

## 🚀 セットアップ

### 1. 依存パッケージインストール

```bash
cd ~/Desktop/ai-secretary
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を編集してAPIキーを設定
```

### 3. Google Calendar API の設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成（または既存を選択）
3. 「APIとサービス」→「ライブラリ」→ **Google Calendar API** を有効化
4. 「認証情報」→「認証情報を作成」→ **OAuth 2.0 クライアントID**
   - アプリケーションの種類: 「ウェブアプリケーション」
   - 承認済みリダイレクトURI: `http://localhost:3000/oauth2callback`
5. クライアントIDとシークレットを `.env` に設定
6. OAuth認証を実行:

```bash
npm run setup-calendar
# ブラウザが開くのでGoogleアカウントでログイン → カレンダーアクセスを許可
```

### 4. 動作確認

```bash
# 株式レポート（カレンダー不要で動作確認できる）
npm run stock

# 朝のブリーフィング（カレンダー設定済みの場合）
npm run brief
```

## ⏰ OpenClaw cronジョブ設定

OpenClawのcron機能で毎朝8時に自動実行:

```
# OpenClaw設定画面またはCLIで:
# 毎朝8:00 JST にブリーフィング実行
cron: "0 8 * * *"
timezone: "Asia/Tokyo"
command: "cd ~/Desktop/ai-secretary && npm run brief"

# 株式レポートも同時に
cron: "0 8 * * *"
timezone: "Asia/Tokyo"
command: "cd ~/Desktop/ai-secretary && npm run stock"
```

## 📊 対象AI銘柄（デフォルト）

NVDA, MSFT, GOOGL, META, AMZN, AMD, SMCI, ARM, PLTR, TSM

`.env` の `STOCK_SYMBOLS` で変更可能。

## 🔮 今後の拡張予定

- [ ] Discord送信の自動化（OpenClaw message API連携）
- [ ] Claude APIでタスク分析の精度向上
- [ ] ニュースサマリーの追加
- [ ] ポートフォリオ管理（保有銘柄・損益追跡）
- [ ] LINE通知オプション
