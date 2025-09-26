// src/core/comboHandler.ts
import dayjs from 'dayjs';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { suggestCombos } from '../ai/suggestCombos';
import { db } from '../db';
import { combos, comboItems, tasks, users } from '../db/schema';
import { bot } from '../bot';
import { getUpcomingTasks } from './scheduler';

export async function runComboSuggest() {
  const now = dayjs();
  const end = now.add(240, 'minute').toDate();
  const snoozeCutoff = new Date();

  const candidateUsers = await db
    .select({ userId: tasks.userId })
    .from(tasks)
    .where(
      and(
        eq(tasks.done, false),
        or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, snoozeCutoff)),
        gt(tasks.startTime, now.toDate()),
        lt(tasks.startTime, end)
      )
    );

  const userIds = [...new Set(candidateUsers.map((row) => row.userId))];

  // 针对每位用户逐个推送合并建议
  for (const userId of userIds) {
    if (userId == null) {
      continue;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.tgChatId) {
      continue;
    }

    const pool = await getUpcomingTasks(userId, 240);
    if (!pool.length) {
      continue;
    }

    const res = await suggestCombos(pool);
    if (!res?.combos?.length) {
      continue;
    }

    const chatId = user.tgChatId.toString();
    for (const combo of res.combos) {
      const reason = combo.reason;
      const ids = combo.taskIds.join(',');
      await bot.api.sendMessage(
        chatId,
        `🧩 建议合并任务（${ids}）：
理由：${reason}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 采纳合并', callback_data: `applyCombo_${ids}` },
              { text: '❌ 忽略', callback_data: `ignoreCombo_${ids}` }
            ]]
          }
        }
      );
    }
  }
}

export async function applyCombo(taskIds: number[], reason: string, userId: number) {
  const [combo] = await db.insert(combos).values({ reason, userId }).returning();
  for (const id of taskIds) {
    await db.insert(comboItems).values({ comboId: combo.id, taskId: id });
  }
}
