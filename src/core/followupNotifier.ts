// src/core/followupNotifier.ts
import dayjs from 'dayjs';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import { tasks, users } from '../db/schema';
import { bot } from '../bot';
import { logger } from '../utils/logger';

const followupSchedule = {
  high: [1, 4, 10],
  normal: [5, 15],
  low: [10]
} as const;

export function getFollowupSchedule(priority: string | null | undefined): number[] {
  const key = (priority ?? 'normal').toLowerCase();
  if (key === 'high') return followupSchedule.high;
  if (key === 'low') return followupSchedule.low;
  return followupSchedule.normal;
}

export async function notifyFollowups() {
  const now = dayjs();
  const nowDate = now.toDate();

  const candidates = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      explanation: tasks.explanation,
      startTime: tasks.startTime,
      priority: tasks.priority,
      followupCount: tasks.followupCount,
      lastReminderAt: tasks.lastReminderAt,
      chatId: users.tgChatId,
      defaultSnoozeMinutes: users.defaultSnoozeMinutes
    })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.userId))
    .where(
      and(
        eq(tasks.done, false),
        eq(tasks.notified, true),
        lt(tasks.startTime, nowDate),
        or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, nowDate))
      )
    );

  for (const task of candidates) {
    if (!task.chatId || !task.startTime) {
      continue;
    }

    const followupsSent = task.followupCount ?? 0;
    const schedule = getFollowupSchedule(task.priority);
    if (!schedule.length || followupsSent >= schedule.length) {
      continue;
    }

    const overdueMinutes = now.diff(dayjs(task.startTime), 'minute', true);
    const threshold = schedule[followupsSent];
    if (overdueMinutes < threshold) {
      continue;
    }

    const lastReminderBase = task.lastReminderAt ? dayjs(task.lastReminderAt) : dayjs(task.startTime);
    const sinceReminder = now.diff(lastReminderBase, 'minute', true);
    if (sinceReminder < 0.5) {
      continue;
    }

    const reminderAt = new Date();
    const [claimed] = await db
      .update(tasks)
      .set({ followupCount: followupsSent + 1, lastReminderAt: reminderAt })
      .where(and(eq(tasks.id, task.id), eq(tasks.followupCount, followupsSent)))
      .returning({ id: tasks.id });

    if (!claimed) {
      continue;
    }

    const snoozeMinutes = task.defaultSnoozeMinutes ?? 10;
    const priority = (task.priority ?? 'normal').toLowerCase();
    const header = priority === 'high' ? '⚠️ 高优先级跟进提醒' : '⏰ 计划跟进提醒';
    const overdueLabel = overdueMinutes >= 1 ? `（已超时约 ${Math.max(1, Math.round(overdueMinutes))} 分钟）` : '';
    const startLabel = dayjs(task.startTime).format('HH:mm');
    const explanation = task.explanation ? `
💡 ${task.explanation}` : '';
    const message = `${header}
任务「${task.title}」应在 ${startLabel} 完成${overdueLabel}。${explanation}
请尽快确认进展，如已处理请点击“完成”，若需要更多时间可以选择推迟。`;

    try {
      await bot.api.sendMessage(task.chatId.toString(), message, {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ 完成', callback_data: `done_${task.id}` },
            { text: `⏰ 推迟${snoozeMinutes}分钟`, callback_data: `snooze_${task.id}_${snoozeMinutes}` },
            { text: '🗑 取消', callback_data: `cancel_${task.id}` }
          ]]
        }
      });
    } catch (err) {
      await db.update(tasks).set({ followupCount: followupsSent, lastReminderAt: task.lastReminderAt ?? null }).where(eq(tasks.id, task.id));
      logger.warn('Failed to send follow-up reminder', { taskId: task.id, err });
    }
  }
}
