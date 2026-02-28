// === AI秘書 型定義 ===

/** タスクの種類 */
export type TaskCategory =
  | 'development'      // 開発
  | 'presentation'     // 資料作成
  | 'communication'    // 連絡
  | 'research'         // リサーチ
  | 'stock'            // 株式関連
  | 'other';

/** 優先度 */
export type Priority = 'high' | 'medium' | 'low';

/** タスクの時間軸 */
export type TimeHorizon = 'today' | 'this_week' | 'next_month';

/** カレンダーイベント（Google Calendar APIから取得） */
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
}

/** 分析済みタスク */
export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: Priority;
  timeHorizon: TimeHorizon;
  estimatedMinutes: number;
  /** 必要なアクション（例: 「コード実装」「スライド作成」「メール送信」） */
  actions: string[];
  /** 元になったカレンダーイベント（あれば） */
  sourceEvent?: CalendarEvent;
  /** 期限 */
  deadline?: Date;
}

/** 朝のブリーフィングメッセージ（1タスク = 1メッセージ） */
export interface BriefingMessage {
  task: Task;
  /** Discord送信用のフォーマット済みテキスト */
  formattedText: string;
}

/** タスクの状態 */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'postponed';

/** タスク状態管理（tasks.json用） */
export interface TaskState {
  id: string;
  summary: string;
  source: 'calendar' | 'routine';
  category: string;
  priority: string;
  status: TaskStatus;
  deadline: string;
  estimatedMinutes: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  /** ボタン押下時にメッセージ編集するためのDiscordメッセージID */
  discordMessageId?: string;
}

/** 株式銘柄データ */
export interface StockData {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  changePercent: number;
  weeklyTrend: 'up' | 'down' | 'flat';
  volume: number;
}

/** 株式レポート */
export interface StockReport {
  date: Date;
  stocks: StockData[];
  /** Markdown形式のレポート本文 */
  markdown: string;
  /** 月曜のみ: 売買判断サマリー */
  tradingSummary?: string;
}
