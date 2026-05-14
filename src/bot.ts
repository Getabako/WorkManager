// === Discord Bot メインエントリポイント（常駐プロセス） ===

import { Events } from 'discord.js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createDiscordClient, sendBriefingWithButtons, createCompleteOnlyButton } from './discord.js';
import { updateTaskStatus } from './taskState.js';
import { generateBriefing } from './morningBrief.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const CHANNEL_ID = process.env.SECRETARY_CHANNEL_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN が .env に設定されていません');
  process.exit(1);
}

if (!CHANNEL_ID) {
  console.error('❌ SECRETARY_CHANNEL_ID が .env に設定されていません');
  process.exit(1);
}

const client = createDiscordClient();

// Bot 準備完了
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 AI秘書Bot ログイン完了: ${c.user.tag}`);
});

// ボタン操作ハンドラ
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[0]; // complete, postpone, start
  const taskId = parts.slice(1).join('_'); // task IDにアンダースコアが含まれる可能性

  try {
    if (action === 'complete') {
      const task = updateTaskStatus(taskId, 'done');
      if (!task) {
        await interaction.reply({ content: '⚠️ タスクが見つかりませんでした', ephemeral: true });
        return;
      }
      // メッセージを編集: 取り消し線 + 完了メッセージ、ボタン無効化
      const originalContent = interaction.message.content;
      const strikethrough = originalContent
        .split('\n')
        .map(line => `~~${line}~~`)
        .join('\n');
      await interaction.update({
        content: `${strikethrough}\n\n✅ **完了しました！** おつかれさまです！`,
        components: [], // ボタン削除
      });

    } else if (action === 'postpone') {
      const task = updateTaskStatus(taskId, 'postponed');
      if (!task) {
        await interaction.reply({ content: '⚠️ タスクが見つかりませんでした', ephemeral: true });
        return;
      }
      await interaction.update({
        content: `${interaction.message.content}\n\n⏭️ **次回のブリーフィングで再表示します**`,
        components: [], // ボタン削除
      });

    } else if (action === 'start') {
      const task = updateTaskStatus(taskId, 'in_progress');
      if (!task) {
        await interaction.reply({ content: '⚠️ タスクが見つかりませんでした', ephemeral: true });
        return;
      }
      // 完了ボタンだけ残す
      const completeOnly = createCompleteOnlyButton(taskId);
      await interaction.update({
        content: `${interaction.message.content}\n\n🔧 **作業開始！頑張ってください！**`,
        components: [completeOnly],
      });
    }
  } catch (error) {
    console.error('❌ ボタン操作エラー:', error);
    try {
      await interaction.reply({ content: '⚠️ エラーが発生しました', ephemeral: true });
    } catch {
      // 既にレスポンス済みの場合は無視
    }
  }
});

// !brief コマンドでブリーフィング手動送信
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content !== '!brief') return;

  console.log('📋 手動ブリーフィング要求を受信');

  try {
    const messages = await generateBriefing();
    await sendBriefingWithButtons(client, message.channelId, messages);
  } catch (error) {
    console.error('❌ ブリーフィング生成エラー:', error);
    await message.reply('⚠️ ブリーフィングの生成に失敗しました。ログを確認してください。');
  }
});

// Bot ログイン
client.login(BOT_TOKEN);
