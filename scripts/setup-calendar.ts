// === Google Calendar OAuth2 セットアップスクリプト ===
// 初回のみ実行。ブラウザでGoogleログインしてカレンダーアクセスを許可する。

import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'http';
import { URL } from 'url';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN_PATH = resolve(import.meta.dirname, '..', 'calendar_token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    console.error('❌ GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を .env に設定してください');
    console.error('');
    console.error('手順:');
    console.error('1. https://console.cloud.google.com/ にアクセス');
    console.error('2. プロジェクトを作成（または既存を選択）');
    console.error('3. Google Calendar API を有効化');
    console.error('4. 認証情報 → OAuth 2.0 クライアントID を作成');
    console.error('5. リダイレクトURI に http://localhost:3000/oauth2callback を追加');
    console.error('6. .env に GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を設定');
    process.exit(1);
  }

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  // 認証URLを生成
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // リフレッシュトークンを確実に取得
  });

  console.log('🔐 Google Calendar OAuth2 セットアップ');
  console.log('');
  console.log('以下のURLをブラウザで開いてGoogleアカウントでログインしてください:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('認証完了を待機中...');

  // ローカルサーバーでコールバックを受け取る
  const port = new URL(redirectUri).port || '3000';

  return new Promise<void>((resolvePromise) => {
    const server = createServer(async (req, res) => {
      if (!req.url?.startsWith('/oauth2callback')) return;

      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');

      if (!code) {
        res.writeHead(400);
        res.end('認証コードが見つかりません');
        return;
      }

      try {
        const { tokens } = await client.getToken(code);
        writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>✅ 認証成功！</h1><p>このタブを閉じてOKです。</p>');

        console.log('');
        console.log('✅ 認証成功！トークンを保存しました。');
        console.log(`📁 ${TOKEN_PATH}`);

        server.close();
        resolvePromise();
      } catch (error) {
        res.writeHead(500);
        res.end('トークン取得に失敗しました');
        console.error('❌ トークン取得エラー:', error);
      }
    });

    server.listen(Number(port), () => {
      console.log(`📡 コールバックサーバー起動: http://localhost:${port}`);
    });
  });
}

main();
