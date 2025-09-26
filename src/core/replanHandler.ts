// src/core/replanHandler.ts
import { getExpiredUnfinished } from "./scheduler";
import { replanTasks } from "../ai/replanTasks";
import { bot } from "../bot";

export async function runReplan() {
  const expired = await getExpiredUnfinished();
  if (!expired.length) return;

  const plan = await replanTasks(expired);
  let text = `${plan.encouragement}\n\n我建议如下重排：\n`;
  for (const r of plan.replan) {
    text += `- 任务#${r.taskId} → ${r.newStartTime}（${r.reason}）\n`;
  }
  await bot.api.sendMessage(process.env.ADMIN_CHAT_ID!, text, {
    reply_markup: { inline_keyboard: [[
      { text: "✅ 采纳重排", callback_data: "applyReplan" },
      { text: "🗑 清空过期", callback_data: "clearExpired" }
    ]] }
  });
}
