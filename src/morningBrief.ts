// === 朝のブリーフィング生成 ===

import type { Task, BriefingMessage } from './types.js';
import { analyzeAndGenerateTasks } from './taskAnalyzer.js';

const PRIORITY_EMOJI = { high: '🔴', medium: '🟡', low: '🟢' } as const;
const CATEGORY_EMOJI = {
  development: '💻',
  presentation: '📊',
  communication: '💬',
  research: '🔍',
  stock: '📈',
  other: '📋',
} as const;

/** 1タスクをDiscordメッセージ形式にフォーマット */
function formatTaskMessage(task: Task, index: number, total: number): string {
  const priority = PRIORITY_EMOJI[task.priority];
  const category = CATEGORY_EMOJI[task.category];
  const hours = Math.floor(task.estimatedMinutes / 60);
  const mins = task.estimatedMinutes % 60;
  const timeStr = hours > 0 ? `${hours}時間${mins > 0 ? mins + '分' : ''}` : `${mins}分`;

  let msg = `${priority} **[${index}/${total}] ${category} ${task.title}**\n`;
  msg += `\n`;
  msg += `📝 ${task.description}\n`;
  msg += `⏱️ 推定: ${timeStr}\n`;

  if (task.deadline) {
    const deadlineStr = task.deadline.toLocaleString('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    msg += `📅 期限: ${deadlineStr}\n`;
  }

  msg += `\n🔧 **必要なアクション:**\n`;
  for (const action of task.actions) {
    msg += `  • ${action}\n`;
  }

  msg += `\n❓ **どうしますか？** （着手 / スキップ / 後回し / 詳細）`;

  return msg;
}

/** ブリーフィングのヘッダーメッセージ */
function formatHeader(tasks: Task[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const highCount = tasks.filter(t => t.priority === 'high').length;
  const medCount = tasks.filter(t => t.priority === 'medium').length;
  const lowCount = tasks.filter(t => t.priority === 'low').length;
  const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  return [
    `☀️ **おはようございます、翔太さん！**`,
    `📅 ${dateStr}`,
    ``,
    `📋 **本日のタスク: ${tasks.length}件**`,
    `  🔴 高: ${highCount}件 | 🟡 中: ${medCount}件 | 🟢 低: ${lowCount}件`,
    `  ⏱️ 合計推定: ${totalHours}時間`,
    ``,
    `それでは1つずつ確認していきましょう！`,
  ].join('\n');
}

/** ブリーフィングメッセージ一覧を生成 */
export async function generateBriefing(): Promise<BriefingMessage[]> {
  const tasks = await analyzeAndGenerateTasks();
  const messages: BriefingMessage[] = [];

  // ヘッダー（ダミータスクとして）
  messages.push({
    task: tasks[0], // ヘッダー用
    formattedText: formatHeader(tasks),
  });

  // 各タスク
  for (let i = 0; i < tasks.length; i++) {
    messages.push({
      task: tasks[i],
      formattedText: formatTaskMessage(tasks[i], i + 1, tasks.length),
    });
  }

  return messages;
}

// 直接実行時: ブリーフィングを標準出力に表示
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🤖 朝のブリーフィングを生成中...\n');

  try {
    const messages = await generateBriefing();
    for (const msg of messages) {
      console.log(msg.formattedText);
      console.log('\n---\n');
    }
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}
