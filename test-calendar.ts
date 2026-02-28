import { getTodayEvents } from './src/calendar.js';

async function main() {
  const events = await getTodayEvents();
  console.log(`今日の予定: ${events.length}件`);
  events.forEach(e => console.log(` - ${e.summary} (${e.start})`));
}

main().catch(console.error);
