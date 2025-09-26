// src/core/conflictHandler.ts
import { detectConflicts } from "../ai/detectConflicts";
import { getUpcomingTasks } from "./scheduler";
import { bot } from "../bot";

export async function runConflictDetection() {
  const pool = await getUpcomingTasks(120);
  if (pool.length < 2) return;

  const result = await detectConflicts(pool);
  if (!result?.conflicts?.length) return;

  for (const c of result.conflicts) {
    await bot.api.sendMessage(process.env.ADMIN_CHAT_ID!, 
`⚠️ 检测到冲突
原因：${c.reason}
建议：${c.suggestion}
`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ 采纳建议", callback_data: `applySuggestion_${c.blockedTaskId}_${c.newStartTime ?? ""}` },
          { text: "⏳ 保持原计划", callback_data: `ignoreSuggestion_${c.blockedTaskId}` }
        ]]
      }
    });
  }
}
