// src/core/conflictHandler.ts
import dayjs from 'dayjs';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { detectConflicts } from '../ai/detectConflicts';
import { db } from '../db';
import { tasks, users } from '../db/schema';
import { bot } from '../bot';
import { getUpcomingTasks } from './scheduler';

export async function runConflictDetection() {
  const now = dayjs();
  const end = now.add(120, 'minute').toDate();
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

  // 针对每位用户分别检查冲突并通知到个人聊天
  for (const userId of userIds) {
    if (userId == null) {
      continue;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.tgChatId) {
      continue;
    }

    const pool = await getUpcomingTasks(userId, 120);
    if (pool.length < 2) {
      continue;
    }

    const result = await detectConflicts(pool);
    if (!result?.conflicts?.length) {
      continue;
    }

    const chatId = user.tgChatId.toString();
    for (const c of result.conflicts) {
      await bot.api.sendMessage(
        chatId,
        `⚠️ 检测到冲突
原因：${c.reason}
建议：${c.suggestion}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 采纳建议', callback_data: `applySuggestion_${c.blockedTaskId}_${c.newStartTime ?? ''}` },
              { text: '⏳ 保持原计划', callback_data: `ignoreSuggestion_${c.blockedTaskId}` }
            ]]
          }
        }
      );
    }
  }
}
