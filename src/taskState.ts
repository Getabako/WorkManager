// === タスク状態管理 ===

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { TaskState, TaskStatus, Task } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TASKS_PATH = resolve(__dirname, '..', 'tasks.json');

/** tasks.json を読み込み */
export function loadTasks(): TaskState[] {
  if (!existsSync(TASKS_PATH)) {
    return [];
  }
  try {
    const raw = readFileSync(TASKS_PATH, 'utf-8');
    return JSON.parse(raw) as TaskState[];
  } catch (error) {
    console.error('⚠️ tasks.json の読み込みに失敗:', error);
    return [];
  }
}

/** tasks.json に書き込み */
export function saveTasks(tasks: TaskState[]): void {
  writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2), 'utf-8');
}

/** 特定タスクの状態を更新 */
export function updateTaskStatus(id: string, status: TaskStatus): TaskState | null {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return null;

  task.status = status;
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  return task;
}

/** 特定タスクのDiscordメッセージIDを記録 */
export function setDiscordMessageId(taskId: string, messageId: string): void {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.discordMessageId = messageId;
  saveTasks(tasks);
}

/** pending + postponed のタスクを返す */
export function getPendingTasks(): TaskState[] {
  const tasks = loadTasks();
  return tasks.filter(t => t.status === 'pending' || t.status === 'postponed');
}

/** ブリーフィング生成時にtasks.jsonを同期 */
export function syncFromBriefing(briefingTasks: Task[]): TaskState[] {
  const existing = loadTasks();
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // 今日の日付プレフィックスを持つ既存タスクを取得
  const todayExisting = existing.filter(t => t.id.startsWith(today.replace(/-/g, '')));
  const todayExistingIds = new Set(todayExisting.map(t => t.id));

  // 既存の今日以外のタスクはそのまま保持
  const otherTasks = existing.filter(t => !t.id.startsWith(today.replace(/-/g, '')));

  // ブリーフィングのタスクを TaskState に変換
  const newTasks: TaskState[] = briefingTasks.map((task, i) => {
    const source = task.sourceEvent ? 'calendar' : 'routine';
    const idPrefix = today.replace(/-/g, '');
    const id = `${idPrefix}-${source === 'calendar' ? 'cal' : 'routine'}-${String(i + 1).padStart(2, '0')}`;

    // 既存タスクがあればステータスを維持
    const existingTask = todayExisting.find(t => t.id === id);
    if (existingTask) {
      return existingTask;
    }

    return {
      id,
      summary: task.title,
      source,
      category: task.category,
      priority: task.priority,
      status: 'pending' as TaskStatus,
      deadline: task.deadline ? task.deadline.toISOString() : `${today}T23:59:00+09:00`,
      estimatedMinutes: task.estimatedMinutes,
      createdAt: now,
      updatedAt: now,
      notes: source === 'calendar' ? 'Googleカレンダーより' : '定常業務',
    };
  });

  const allTasks = [...otherTasks, ...newTasks];
  saveTasks(allTasks);
  return newTasks;
}
