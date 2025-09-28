// src/core/conflictHandler.ts
import dayjs from 'dayjs';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { detectConflicts } from '../ai/detectConflicts';
import { db } from '../db';
import { tasks, users } from '../db/schema';
import { bot } from '../bot';
import { getUpcomingTasks } from './scheduler';

export async function checkConflictsForUser(userId: number, minutesAhead = 120) {
  if (userId == null) {
    return;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.tgChatId) {
    return;
  }

  const pool = await getUpcomingTasks(userId, minutesAhead);
  if (pool.length < 2) {
    return;
  }

  const chatId = user.tgChatId.toString();
  const debugPrefix = '🧪 [调试]';
  const replacer = (key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);
  await bot.api.sendMessage(chatId, `${debugPrefix} 开始检测冲突，任务数量：${pool.length}`);

  let result: Awaited<ReturnType<typeof detectConflicts>>;
  try {
    result = await detectConflicts(pool);
  } catch (err) {
    await bot.api.sendMessage(chatId, `${debugPrefix} 检测失败：${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const serialized = JSON.stringify(result ?? { conflicts: [] }, replacer, 2);
  await bot.api.sendMessage(chatId, `${debugPrefix} 检测结果：
${serialized}`);

  if (!result?.conflicts?.length) {
    return;
  }

  for (const c of result.conflicts) {
    const sections = [
      '⚠️ 检测到冲突',
      `原因：${c.reason}`,
      `建议：${c.suggestion}`
    ];
    if (c.newStartTime) {
      const when = dayjs(c.newStartTime).format('MM-DD HH:mm');
      sections.push(`⏰ 建议新的开始时间：${when}`);
      await bot.api.sendMessage(
        chatId,
        sections.join('

'),
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ 采纳建议', callback_data: `applySuggestion_${c.blockedTaskId}_${c.newStartTime}` },
              { text: '⏳ 保持原计划', callback_data: `ignoreSuggestion_${c.blockedTaskId}` }
            ]]
          }
        }
      );
    } else {
      await bot.api.sendMessage(chatId, sections.join('

'));
    }
  }
}

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
    await checkConflictsForUser(userId, 120);
  }
}
