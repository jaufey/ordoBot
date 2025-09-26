// src/core/clarificationFlow.ts
import { db } from "../db";
import { clarifications, tasks } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { bot } from "../bot";
import dayjs from "dayjs";

/** 插入追问队列 */
export async function saveClarifications(userId: number, taskId: number, qs: Array<{ id: string; question: string; options?: string[]; explanation?: string }>) {
  let idx = 0;
  for (const q of qs) {
    await db.insert(clarifications).values({
      userId, taskId,
      questionId: q.id, question: q.question,
      options: q.options ?? null,
      explanation: q.explanation ?? null,
      orderIndex: idx++
    });
  }
}

/** 取下一条未回答的追问并发送 */
export async function askNextClarification(userId: number, taskId: number, chatId: bigint | number | string) {
  const next = await db.query.clarifications.findFirst({
    where: and(eq(clarifications.userId, userId), eq(clarifications.taskId, taskId), eq(clarifications.answered, false)),
    orderBy: (c, { asc }) => [asc(c.orderIndex)]
  });
  if (!next) return false;

  const keyboard = next.options
    ? { inline_keyboard: next.options.map(opt => [{ text: opt, callback_data: `clarify_${taskId}_${next.questionId}_${encodeURIComponent(opt)}` }]) }
    : { inline_keyboard: [[{ text: "跳过", callback_data: `clarify_${taskId}_${next.questionId}_${encodeURIComponent("跳过")}` }]] };

  const text = `❓ ${next.question}\n${next.explanation ? `💡 ${next.explanation}` : ""}`;
  const targetChatId = typeof chatId === 'bigint' ? chatId.toString() : chatId;
  await bot.api.sendMessage(targetChatId, text, { reply_markup: keyboard });
  return true;
}

/** 应答后处理（可根据 questionId 定制） */
export async function applyClarificationAnswer(userId: number, taskId: number, questionId: string, answer: string) {
  // 1) 落库追问答案
  await db.update(clarifications)
    .set({ answered: true, answerText: answer })
    .where(and(eq(clarifications.userId, userId), eq(clarifications.taskId, taskId), eq(clarifications.questionId, questionId)));

  // 2) 针对常见 questionId 做确定性处理（示例）
  if (questionId === "time_type") {
    // 例如：起飞时间 → 父任务表示航班；可在此倒推/调整
    // （这里留空，通常配合 suggestedTasks 或再算倒推）
  }
  if (questionId === "preference_lactose") {
    // 设置用户画像：乳糖不耐
    // … 可更新 users.profile（略）
  }

  // 3) 如果没有更多问题 → 返回 false（表示追问结束）
  const remaining = await db.query.clarifications.findFirst({
    where: and(eq(clarifications.userId, userId), eq(clarifications.taskId, taskId), eq(clarifications.answered, false))
  });
  return !remaining;
}
