// === Google Calendar API連携 ===

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import type { CalendarEvent } from './types.js';

dotenv.config();

const TOKEN_PATH = resolve(import.meta.dirname, '..', 'calendar_token.json');

/** OAuth2クライアントを作成 */
function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を .env に設定してください');
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

/** 保存済みトークンを読み込んでOAuth2クライアントを認証済みにする */
export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const client = createOAuth2Client();

  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      'calendar_token.json が見つかりません。\n' +
      '先に `npm run setup-calendar` を実行してOAuth認証を完了してください。'
    );
  }

  const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
  client.setCredentials(token);

  // トークンが期限切れなら自動リフレッシュ
  client.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    console.log('📅 トークンを自動リフレッシュしました');
  });

  return client;
}

/** トークンを保存する（setup-calendar用） */
export function saveToken(token: object): void {
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log(`📅 トークンを保存しました: ${TOKEN_PATH}`);
}

/** Google Calendar APIクライアントを取得 */
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = await getAuthenticatedClient();
  return google.calendar({ version: 'v3', auth });
}

/** Google CalendarのイベントをCalendarEvent型に変換 */
function toCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  const start = event.start?.dateTime || event.start?.date || '';
  const end = event.end?.dateTime || event.end?.date || '';

  return {
    id: event.id || '',
    summary: event.summary || '(タイトルなし)',
    description: event.description || undefined,
    start: new Date(start),
    end: new Date(end),
    location: event.location || undefined,
    attendees: event.attendees?.map(a => a.email || '').filter(Boolean),
  };
}

/** 指定期間のイベントを取得 */
async function getEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient();

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  return (response.data.items || []).map(toCalendarEvent);
}

/** 今日のイベントを取得 */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  return getEvents(startOfDay, endOfDay);
}

/** 今日から1週間のイベントを取得 */
export async function getWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneWeekLater = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
  return getEvents(startOfDay, oneWeekLater);
}

/** 今日から1ヶ月のイベントを取得 */
export async function getMonthEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneMonthLater = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return getEvents(startOfDay, oneMonthLater);
}
