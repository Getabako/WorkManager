// === 予定 → タスク変換エンジン ===

import type { CalendarEvent, Task, TaskCategory, Priority, TimeHorizon } from './types.js';
import { getTodayEvents, getWeekEvents, getMonthEvents } from './calendar.js';

let taskIdCounter = 0;
function nextId(): string {
  return `task-${++taskIdCounter}`;
}

/** イベントのタイトル・説明からタスクカテゴリを推定 */
function classifyCategory(event: CalendarEvent): TaskCategory {
  const text = `${event.summary} ${event.description || ''}`.toLowerCase();

  if (/開発|実装|コード|デプロイ|リリース|バグ|修正|api|システム/.test(text)) return 'development';
  if (/資料|スライド|プレゼン|発表|研修/.test(text)) return 'presentation';
  if (/連絡|メール|電話|面談|相談|生徒|親御|保護者|企業|打ち合わせ|mtg|ミーティング/.test(text)) return 'communication';
  if (/調査|リサーチ|分析|調べ|検討|補助金/.test(text)) return 'research';
  if (/株|投資|売買|銘柄|決算|チャート/.test(text)) return 'stock';

  return 'other';
}

/** カテゴリから推定所要時間（分）を返す */
function estimateMinutes(category: TaskCategory, event: CalendarEvent): number {
  // イベント自体に時間があればそれを使う
  const eventDuration = (event.end.getTime() - event.start.getTime()) / (1000 * 60);
  if (eventDuration > 0 && eventDuration < 480) return Math.round(eventDuration);

  // なければカテゴリで推定
  const defaults: Record<TaskCategory, number> = {
    development: 120,
    presentation: 90,
    communication: 30,
    research: 60,
    stock: 45,
    other: 30,
  };
  return defaults[category];
}

/** カテゴリから必要アクションを返す */
function getActions(category: TaskCategory): string[] {
  const actionMap: Record<TaskCategory, string[]> = {
    development: ['コード実装', 'テスト', 'デプロイ'],
    presentation: ['スライド作成', '内容確認', 'リハーサル'],
    communication: ['連絡文面作成', '送信', 'フォローアップ'],
    research: ['情報収集', '分析', 'まとめ作成'],
    stock: ['データ取得', 'チャート分析', 'レポート作成'],
    other: ['確認', '対応'],
  };
  return actionMap[category];
}

/** カレンダーイベントをタスクに変換 */
function eventToTask(event: CalendarEvent, timeHorizon: TimeHorizon, priority: Priority): Task {
  const category = classifyCategory(event);

  return {
    id: nextId(),
    title: event.summary,
    description: event.description || event.summary,
    category,
    priority,
    timeHorizon,
    estimatedMinutes: estimateMinutes(category, event),
    actions: getActions(category),
    sourceEvent: event,
    deadline: event.start,
  };
}

/** 定常業務タスクを生成 */
function getRoutineTasks(): Task[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=日, 1=月, ...
  const tasks: Task[] = [];

  // 毎日: 株式分析レポート
  tasks.push({
    id: nextId(),
    title: '📊 AI銘柄 日次分析レポート',
    description: '主要AI銘柄の株価・トレンド・ニュースを分析してレポート生成',
    category: 'stock',
    priority: 'high',
    timeHorizon: 'today',
    estimatedMinutes: 30,
    actions: ['株価データ取得', 'トレンド分析', 'レポート生成'],
  });

  // 月曜: 売買判断
  if (dayOfWeek === 1) {
    tasks.push({
      id: nextId(),
      title: '💰 週間売買判断サマリー',
      description: '今週の売買方針を決定。大和証券での注文検討。',
      category: 'stock',
      priority: 'high',
      timeHorizon: 'today',
      estimatedMinutes: 45,
      actions: ['週間パフォーマンス確認', '売買判断', '注文検討'],
    });
  }

  // 毎日: 連絡確認
  tasks.push({
    id: nextId(),
    title: '📩 生徒・親御さん・企業への連絡確認',
    description: 'if塾の生徒/保護者、企業クライアントへの返信・連絡',
    category: 'communication',
    priority: 'medium',
    timeHorizon: 'today',
    estimatedMinutes: 30,
    actions: ['未読確認', '返信文面作成', '送信'],
  });

  return tasks;
}

/** メイン: カレンダーからタスクリストを生成 */
export async function analyzeAndGenerateTasks(): Promise<Task[]> {
  // カレンダーイベント取得
  const [todayEvents, weekEvents, monthEvents] = await Promise.all([
    getTodayEvents(),
    getWeekEvents(),
    getMonthEvents(),
  ]);

  const tasks: Task[] = [];

  // 今日のイベント → 高優先度タスク
  for (const event of todayEvents) {
    tasks.push(eventToTask(event, 'today', 'high'));
  }

  // 今週のイベント（今日除く）→ 中優先度タスク（準備が必要なもの）
  const todayStr = new Date().toDateString();
  for (const event of weekEvents) {
    if (event.start.toDateString() === todayStr) continue; // 今日分は除外
    tasks.push(eventToTask(event, 'this_week', 'medium'));
  }

  // 来月のイベント（今週除く）→ 低優先度タスク
  const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  for (const event of monthEvents) {
    if (event.start < oneWeekLater) continue; // 今週分は除外
    tasks.push(eventToTask(event, 'next_month', 'low'));
  }

  // 定常業務を追加
  tasks.push(...getRoutineTasks());

  // 優先度でソート: high → medium → low
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return tasks;
}
