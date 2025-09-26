import 'dotenv/config';
import cron from 'node-cron';
import dayjs from 'dayjs';
import { Bot } from 'grammy';

const token = process.env.BOT_TOKEN;
const targetChatId = process.env.ADMIN_CHAT_ID ?? process.env.TARGET_CHAT_ID;

if (!token) {
  throw new Error('BOT_TOKEN 未配置，无法发送通知');
}

if (!targetChatId) {
  throw new Error('ADMIN_CHAT_ID 或 TARGET_CHAT_ID 未配置，无法发送通知');
}

const bot = new Bot(token);

async function sendHeartbeat() {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  try {
    await bot.api.sendMessage(targetChatId, `⏰ 心跳提醒：当前时间 ${now}`);
    console.log(`[heartbeat] 已通知 ${now}`);
  } catch (error) {
    console.error('[heartbeat] 发送失败', error);
  }
}

// 启动时先发一条
await sendHeartbeat();

// 每 30 分钟执行一次
cron.schedule('*/30 * * * *', sendHeartbeat);

console.log('🚀 heartbeat.ts 已启动，将每 30 分钟推送一次当前时间');
