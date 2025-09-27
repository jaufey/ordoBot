// src/core/replanHandler.ts
import { and, eq, lt } from 'drizzle-orm';
import dayjs from 'dayjs';
import { getExpiredUnfinished } from './scheduler';
import { getFollowupSchedule } from './followupNotifier';
import { replanTasks } from '../ai/replanTasks';
import { bot } from '../bot';
import { db } from '../db';
import { tasks, users } from '../db/schema';

export async function runReplan() {
  const now = new Date();
  const candidateUsers = await db
    .select({ userId: tasks.userId })
    .from(tasks)
    .where(and(eq(tasks.done, false), lt(tasks.startTime, now)));

  const userIds = [...new Set(candidateUsers.map((row) => row.userId))];

  // 按用户拆分过期任务并发送重排建议
  for (const userId of userIds) {
    if (userId == null) {
      continue;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.tgChatId) {
      continue;
    }

    const expired = await getExpiredUnfinished(userId);
    if (!expired.length) {
      continue;
    }

    const nowMoment = dayjs();
    const eligible = expired.filter((task) => {
      const schedule = getFollowupSchedule(task.priority);
      const followupsSent = task.followupCount ?? 0;
      if (!schedule.length) {
        return true;
      }
      if (followupsSent >= schedule.length) {
        if (!task.lastReminderAt) {
          return true;
        }
        return nowMoment.diff(dayjs(task.lastReminderAt), 'minute', true) >= 1;
      }
      const lastThreshold = schedule[schedule.length - 1];
      return nowMoment.diff(dayjs(task.startTime), 'minute', true) >= lastThreshold + 15;
    });

    if (!eligible.length) {
      continue;
    }

    const plan = await replanTasks(eligible);
    const chatId = user.tgChatId.toString();

    let text = `${plan.encouragement}

我建议如下重排：
`;
    for (const r of plan.replan) {
      text += `- 任务#${r.taskId} → ${r.newStartTime}（${r.reason}）
`;
    }

    await bot.api.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ 采纳重排', callback_data: 'applyReplan' },
          { text: '🗑 清空过期', callback_data: 'clearExpired' }
        ]]
      }
    });
  }
}
