// === Discord Bot クライアント + ボタン送信 ===

import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { BriefingMessage } from './types.js';
import { syncFromBriefing, setDiscordMessageId } from './taskState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', '.env') });

/** Discord.js Client を作成 */
export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}

/** タスク用のボタン行を生成 */
function createTaskButtons(taskId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`complete_${taskId}`)
      .setLabel('完了')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`postpone_${taskId}`)
      .setLabel('後回し')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`start_${taskId}`)
      .setLabel('着手')
      .setEmoji('🔧')
      .setStyle(ButtonStyle.Primary),
  );
}

/** 「完了」ボタンだけの行を生成（着手後用） */
function createCompleteOnlyButton(taskId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`complete_${taskId}`)
      .setLabel('完了')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
  );
}

/** ブリーフィングメッセージをボタン付きでDiscordに送信 */
export async function sendBriefingWithButtons(
  client: Client,
  channelId: string,
  messages: BriefingMessage[],
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    console.error('❌ チャンネルが見つからないか、テキストチャンネルではありません:', channelId);
    return;
  }
  const textChannel = channel as TextChannel;

  // tasks.json を同期（ヘッダー以外のタスクを渡す）
  const tasks = messages.slice(1).map(m => m.task);
  const taskStates = syncFromBriefing(tasks);

  // ヘッダーメッセージ送信（ボタンなし）
  if (messages.length > 0) {
    await textChannel.send(messages[0].formattedText);
  }

  // 各タスクメッセージをボタン付きで送信
  for (let i = 0; i < taskStates.length; i++) {
    const taskState = taskStates[i];
    const briefingMsg = messages[i + 1]; // +1 はヘッダー分

    if (!briefingMsg) continue;

    const buttons = createTaskButtons(taskState.id);
    const sent = await textChannel.send({
      content: briefingMsg.formattedText,
      components: [buttons],
    });

    // メッセージIDを記録
    setDiscordMessageId(taskState.id, sent.id);
  }

  console.log(`📤 ブリーフィング送信完了: ${taskStates.length}件のタスク`);
}

export { createTaskButtons, createCompleteOnlyButton };
