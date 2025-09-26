import { Bot } from "grammy";
import * as dotenv from "dotenv";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN!);

async function sendNotification(message: string) {
  try {
    await bot.api.sendMessage(process.env.TARGET_CHAT_ID!, message, {
      disable_notification: false, // 如果你想静默推送改成 true
    });
    console.log("✅ Telegram 通知已发送");
  } catch (error) {
    console.error("❌ 发送通知失败:", error);
  }
}

// 命令行传入参数，例如：node notify.js "任务完成"
const msg = process.argv[2] ?? "🚀 AI 任务已执行完成！";
sendNotification(msg).then(() => process.exit(0));
