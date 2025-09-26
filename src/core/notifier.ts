// src/core/notifier.ts
import dayjs from "dayjs";
import { db } from "../db";
import { tasks } from "../db/schema";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { checkConditions } from "./conditionChecker";
import { bot } from "../bot";

export async function notifyDueTasks() {
  const now = dayjs();
  const windowEnd = now.add(1, "minute").toDate();

  const due = await db.select().from(tasks).where(
    and(
      eq(tasks.done, false),
      eq(tasks.notified, false),
      or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, new Date())),
      lt(tasks.startTime, windowEnd)
    )
  );

  for (const t of due) {
    if (!(await checkConditions(t))) continue; // 条件不满足，不提醒（也可以顺延）

    await bot.api.sendMessage(process.env.ADMIN_CHAT_ID!, 
`🔔 到点了：${t.title}
${t.explanation ? `💡 ${t.explanation}` : ""}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ 完成", callback_data: `done_${t.id}` },
          { text: "⏰ 推迟10分钟", callback_data: `snooze_${t.id}_10` },
          { text: "🗑 取消", callback_data: `cancel_${t.id}` }
        ]]
      }
    });

    await db.update(tasks).set({ notified: true }).where(eq(tasks.id, t.id));
  }
}
