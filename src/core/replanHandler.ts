// src/core/replanHandler.ts
import { and, eq, lt } from 'drizzle-orm';
import { getExpiredUnfinished } from './scheduler';
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

    const plan = await replanTasks(expired);
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
