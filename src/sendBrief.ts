// === ワンショット ブリーフィング送信（GitHub Actions + Gemini API） ===

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yahooFinance from 'yahoo-finance2';
import dotenv from 'dotenv';
import type { CalendarEvent, StockData } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// ===== 設定 =====
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TOKEN_PATH = resolve(__dirname, '..', 'calendar_token.json');
const TOKEN_PATH_SECONDARY = resolve(__dirname, '..', 'calendar_token_secondary.json');
const TASKS_PATH = resolve(__dirname, '..', 'tasks.json');
const PROJECTS_PATH = resolve(__dirname, '..', 'projects.json');

const DEFAULT_SYMBOLS = ['NVDA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'AMD', 'SMCI', 'ARM', 'PLTR', 'TSM'];

// ===== カレンダー =====
/** refresh_token から新しい access_token を取得 */
async function refreshAccessToken(token: {
  refresh_token: string;
  client_id?: string;
  client_secret?: string;
}): Promise<string> {
  const clientId = token.client_id || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = token.client_secret || process.env.GOOGLE_CLIENT_SECRET;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${body}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function createAuthClient(tokenPath: string): Promise<OAuth2Client> {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
  );
  const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));

  // refresh_token を使って常に新しい access_token を取得
  if (token.refresh_token) {
    try {
      const newAccessToken = await refreshAccessToken(token);
      token.access_token = newAccessToken;
      token.token = newAccessToken;
      console.log(`🔄 トークンリフレッシュ成功 (${tokenPath.split('/').pop()})`);
    } catch (err) {
      console.error(`⚠️ トークンリフレッシュ失敗、既存トークンで試行:`, err);
    }
  }

  client.setCredentials(token);
  return client;
}

async function fetchCalendarEvents(
  tokenPath: string,
  timeMin: Date,
  timeMax: Date,
  label: string,
): Promise<(CalendarEvent & { account: string })[]> {
  if (!existsSync(tokenPath)) return [];

  try {
    const auth = await createAuthClient(tokenPath);
    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    return (response.data.items || []).map(event => ({
      id: event.id || '',
      summary: event.summary || '(タイトルなし)',
      description: event.description || undefined,
      start: new Date(event.start?.dateTime || event.start?.date || ''),
      end: new Date(event.end?.dateTime || event.end?.date || ''),
      location: event.location || undefined,
      attendees: event.attendees?.map(a => a.email || '').filter(Boolean),
      account: label,
    }));
  } catch (error) {
    console.error(`⚠️ カレンダー取得失敗 (${label}):`, error);
    return [];
  }
}

async function getAllEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<(CalendarEvent & { account: string })[]> {
  const [primary, secondary] = await Promise.all([
    fetchCalendarEvents(TOKEN_PATH, timeMin, timeMax, 'メイン'),
    fetchCalendarEvents(TOKEN_PATH_SECONDARY, timeMin, timeMax, 'サブ'),
  ]);

  const all = [...primary, ...secondary];
  all.sort((a, b) => a.start.getTime() - b.start.getTime());
  return all;
}

// ===== 株式 =====
function getSymbols(): string[] {
  const env = process.env.STOCK_SYMBOLS;
  if (env) return env.split(',').map(s => s.trim());
  return DEFAULT_SYMBOLS;
}

async function fetchAllStocks(): Promise<StockData[]> {
  const symbols = getSymbols();
  const results = await Promise.allSettled(
    symbols.map(async (symbol): Promise<StockData | null> => {
      try {
        const quote = await yahooFinance.quote(symbol);
        if (!quote || !quote.regularMarketPrice) return null;

        const price = quote.regularMarketPrice;
        const prevClose = quote.regularMarketPreviousClose || price;
        const changePercent = ((price - prevClose) / prevClose) * 100;

        let weeklyTrend: 'up' | 'down' | 'flat' = 'flat';
        if (changePercent > 1) weeklyTrend = 'up';
        else if (changePercent < -1) weeklyTrend = 'down';

        return {
          symbol,
          name: quote.shortName || quote.longName || symbol,
          price,
          previousClose: prevClose,
          changePercent: Math.round(changePercent * 100) / 100,
          weeklyTrend,
          volume: quote.regularMarketVolume || 0,
        };
      } catch {
        console.error(`⚠️ ${symbol} 取得失敗`);
        return null;
      }
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<StockData | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((d): d is StockData => d !== null);
}

// ===== コンテキストデータ読み込み =====
function loadPendingTasks(): string {
  if (!existsSync(TASKS_PATH)) return 'なし';
  try {
    const tasks = JSON.parse(readFileSync(TASKS_PATH, 'utf-8'));
    const pending = tasks.filter(
      (t: { status: string }) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (pending.length === 0) return 'なし';
    return pending
      .map((t: { summary: string; status: string; priority: string; notes?: string }) =>
        `- [${t.priority}] ${t.summary} (${t.status})${t.notes ? ` ※${t.notes}` : ''}`,
      )
      .join('\n');
  } catch {
    return '読み込みエラー';
  }
}

function loadActiveProjects(): string {
  if (!existsSync(PROJECTS_PATH)) return 'なし';
  try {
    const data = JSON.parse(readFileSync(PROJECTS_PATH, 'utf-8'));
    const active = data.projects.filter(
      (p: { status: string }) =>
        p.status.includes('運用中') || p.status.includes('開発中') || p.status.includes('進行中'),
    );
    return active
      .map(
        (p: { name: string; status: string; client?: string }) =>
          `- ${p.name}: ${p.status}${p.client ? ` (${p.client})` : ''}`,
      )
      .join('\n');
  } catch {
    return '読み込みエラー';
  }
}

const POST_HISTORY_PATH = resolve(__dirname, '..', 'content_post_history.json');

function loadPostHistory(): string {
  if (!existsSync(POST_HISTORY_PATH)) return 'なし';
  try {
    const data = JSON.parse(readFileSync(POST_HISTORY_PATH, 'utf-8'));
    const posts = data.posts || [];
    if (posts.length === 0) return 'なし';
    const channels = data.rules?.channels || [];
    const recent = posts.slice(0, 10);
    let text = `配信チャンネル: ${channels.join(', ')}\n`;
    text += `直近の投稿:\n`;
    text += recent
      .map((p: { date: string; channel: string; theme: string }) =>
        `- ${p.date} [${p.channel}] ${p.theme}`,
      )
      .join('\n');
    return text;
  } catch {
    return '読み込みエラー';
  }
}

// ===== Gemini API =====
async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY が未設定');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ===== イベント → テキスト変換 =====
function formatEventForPrompt(event: CalendarEvent & { account: string }): string {
  const isAllDay =
    event.start.getHours() === 0 &&
    event.start.getMinutes() === 0 &&
    event.end.getHours() === 0 &&
    event.end.getMinutes() === 0;

  const time = isAllDay
    ? '終日'
    : `${event.start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })}-${event.end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

  const dateStr = `${event.start.getMonth() + 1}/${event.start.getDate()}`;
  const loc = event.location ? ` @${event.location}` : '';
  return `[${event.account}] ${dateStr} ${time} ${event.summary}${loc}`;
}

function formatStockForPrompt(stock: StockData): string {
  const sign = stock.changePercent >= 0 ? '+' : '';
  return `${stock.symbol} (${stock.name}): $${stock.price.toFixed(2)} ${sign}${stock.changePercent}% vol:${(stock.volume / 1_000_000).toFixed(1)}M`;
}

// ===== プロンプト構築 =====
function buildPrompt(
  now: Date,
  todayEvents: (CalendarEvent & { account: string })[],
  weekEvents: (CalendarEvent & { account: string })[],
  stocks: StockData[],
  pendingTasks: string,
  activeProjects: string,
  postHistory: string,
): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${days[now.getDay()]})`;

  const todayText =
    todayEvents.length > 0
      ? todayEvents.map(formatEventForPrompt).join('\n')
      : '予定なし';

  const weekText =
    weekEvents.length > 0
      ? weekEvents.map(formatEventForPrompt).join('\n')
      : '特になし';

  const stockText =
    stocks.length > 0
      ? stocks.map(formatStockForPrompt).join('\n')
      : '取得できませんでした';

  return `あなたは翔太さん（Getabako / if(塾)経営者・フリーランスエンジニア）のAI秘書です。
30代女性の秘書として、丁寧だが飾りすぎない自然な口調で話してください。特徴的な語尾や過度な敬語は不要です。
以下のデータから、毎朝のDiscordブリーフィングメッセージを生成してください。

## 出力フォーマット（厳守）

おはよう！${dateStr}

【1. 予定の確認】
今日:
（今日のイベントを時刻付きで列挙。なければ「予定なし」）
今後1週間の注目:
（重要なものをピックアップ。日付(曜日)+時刻+内容）
⚠️ 重複/注意:
（2アカウントで重複しているイベントや注意点があれば記載。なければ省略）

【2. 株の確認】
（株式データの要約。全銘柄を列挙せず、注目ポイントだけ簡潔にまとめる。今日の方針を1行で。データなしなら週明けに備える旨を書く）

【3. 開発/運用の確認】
（進行中のプロジェクトや未完了タスクから、今日意識すべきことを2-3行で）

【4. 準備の確認】
（今後1週間の予定を先読みして、今日のうちにやっておくべき準備を列挙）

【5. 対応の確認】
（継続案件のフォローや品質管理について。NPO対応、投稿品質チェック、クライアント対応など、放置すると問題になるものを記載）

【6. 広告/情報発信の確認（今日の判断）】
（if-juku、if-business、Instagram等の投稿方針。直近の投稿履歴を踏まえて、今日投稿すべきか保留かを判断。品質が不安定なら「整える日」にする提案もOK）

【タスク一覧】
（今日やるべきことを優先順にリスト化。各タスクに推定時間を付ける）

## 優先度の絵文字ルール（厳守）
- 高優先度: 🔴 （赤丸）
- 中優先度: 🟡 （黄丸）
- 低優先度: 🟢 （緑丸）
タスク一覧では [high] [medium] [low] ではなく、必ず上記の絵文字を使うこと。
例: 🔴 未踏アドバンスト 書類作成（3h）

## ルール
- Discord送信なのでMarkdownは使えないが、**太字**は使える
- 簡潔かつ実用的に。余計な挨拶や修飾は不要
- セクション内でデータがなければ「特になし」と書く
- 「おはよう！」の1行目は変えない
- 2アカウントのカレンダーで同じイベントがあれば重複注意を入れる
- 全体で1800文字以内に収める

## 入力データ

### 今日の予定（${dateStr}）
${todayText}

### 今後1週間の予定
${weekText}

### 株式データ
${stockText}

### 未完了タスク
${pendingTasks}

### 進行中プロジェクト
${activeProjects}

### 投稿/情報発信の履歴
${postHistory}
`;
}

// ===== Discord Webhook =====
async function sendWebhook(content: string): Promise<void> {
  if (!WEBHOOK_URL) throw new Error('DISCORD_WEBHOOK_URL が未設定');

  const chunks = splitMessage(content, 2000);
  for (const chunk of chunks) {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunk }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Webhook送信失敗: ${resp.status} ${body}`);
    }
    // 複数チャンクの場合はレート制限対策
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 1000));
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > maxLen && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ===== メイン =====
async function main() {
  console.log('🤖 ブリーフィング生成開始...');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const oneWeekLater = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);

  // データ収集（並列）
  console.log('📅 カレンダー・株式データ取得中...');
  const [todayEvents, weekEvents, stocks] = await Promise.all([
    getAllEvents(startOfDay, endOfDay),
    getAllEvents(endOfDay, oneWeekLater),
    fetchAllStocks().catch(err => {
      console.error('⚠️ 株式データ取得失敗:', err);
      return [] as StockData[];
    }),
  ]);

  console.log(`  今日の予定: ${todayEvents.length}件`);
  console.log(`  今週の予定: ${weekEvents.length}件`);
  console.log(`  株式銘柄: ${stocks.length}件`);

  // コンテキスト読み込み
  const pendingTasks = loadPendingTasks();
  const activeProjects = loadActiveProjects();
  const postHistory = loadPostHistory();

  // Gemini でブリーフィング生成
  console.log('🧠 Gemini API でブリーフィング生成中...');
  const prompt = buildPrompt(now, todayEvents, weekEvents, stocks, pendingTasks, activeProjects, postHistory);
  const briefing = await callGemini(prompt);

  console.log('\n--- 生成結果 ---');
  console.log(briefing);
  console.log('--- ここまで ---\n');

  // Discord 送信
  console.log('📤 Discord に送信中...');
  await sendWebhook(briefing);

  console.log('✅ ブリーフィング送信完了！');
}

main().catch(error => {
  console.error('❌ エラー:', error);
  process.exit(1);
});
