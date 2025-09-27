// src/core/notifier.ts
import dayjs from 'dayjs';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import { tasks, users } from '../db/schema';
import { checkConditions } from './conditionChecker';
import { bot } from '../bot';

export async function notifyDueTasks() {
  const now = dayjs();
  const windowEnd = now.add(1, 'minute').toDate();
  const snoozeCutoff = new Date();

  const due = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      explanation: tasks.explanation,
      userId: tasks.userId,
      startTime: tasks.startTime,
      snoozedUntil: tasks.snoozedUntil,
      chatId: users.tgChatId,
      defaultSnoozeMinutes: users.defaultSnoozeMinutes,
      conditionConstraints: tasks.conditionConstraints
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.userId))
    .where(
      and(
        eq(tasks.done, false),
        eq(tasks.notified, false),
        or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, snoozeCutoff)),
        lt(tasks.startTime, windowEnd)
      )
    );

  for (const t of due) {
    if (!t.chatId) {
      continue;
    }

    if (!(await checkConditions(t))) {
      continue;
    }

    const chatId = t.chatId.toString();
    const snoozeMinutes = t.defaultSnoozeMinutes ?? 10;
    const reminderAt = new Date();

    const [claimed] = await db
      .update(tasks)
      .set({ notified: true, followupCount: 0, lastReminderAt: reminderAt })
      .where(and(eq(tasks.id, t.id), eq(tasks.notified, false)))
      .returning({ id: tasks.id });

    if (!claimed) {
      continue;
    }

    try {
      await bot.api.sendMessage(
        chatId,
        `🔔 到点了：${t.title}
${t.explanation ? `💡 ${t.explanation}` : ''}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 完成', callback_data: `done_${t.id}` },
              { text: `⏰ 推迟${snoozeMinutes}分钟`, callback_data: `snooze_${t.id}_${snoozeMinutes}` },
              { text: '🗑 取消', callback_data: `cancel_${t.id}` }
            ]]
          }
        }
      );
    } catch (err) {
      await db.update(tasks).set({ notified: false, followupCount: 0, lastReminderAt: null }).where(eq(tasks.id, t.id));
      throw err;
    }
  }
}
