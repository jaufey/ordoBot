// src/core/comboHandler.ts
import { suggestCombos } from '../ai/suggestCombos';
import { getUpcomingTasks } from './scheduler';
import { db } from '../db';
import { combos, comboItems } from '../db/schema';
import { bot } from '../bot';

export async function runComboSuggest() {
  const pool = await getUpcomingTasks(240);
  const res = await suggestCombos(pool);
  if (!res?.combos?.length) return;

  for (const combo of res.combos) {
    const reason = combo.reason;
    const ids = combo.taskIds.join(',');
    await bot.api.sendMessage(process.env.ADMIN_CHAT_ID!,
      `🧩 建议合并任务（${ids}）：
理由：${reason}`, {
      reply_markup: { inline_keyboard: [[
        { text: '✅ 采纳合并', callback_data: `applyCombo_${ids}` },
        { text: '❌ 忽略', callback_data: `ignoreCombo_${ids}` }
      ]] }
    });
  }
}

export async function applyCombo(taskIds: number[], reason: string) {
  const [c] = await db.insert(combos).values({ reason }).returning();
  for (const id of taskIds) {
    await db.insert(comboItems).values({ comboId: c.id, taskId: id });
  }
}
