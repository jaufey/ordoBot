// src/bot/handlers.ts
import dayjs from 'dayjs';
import type { Bot, Context } from 'grammy';
import { parseTask, toInsertable } from '../ai/parseTask';
import { db } from '../db';
import { tasks } from '../db/schema';
import { applyCombo } from '../core/comboHandler';
import { saveClarifications, askNextClarification, applyClarificationAnswer } from '../core/clarificationFlow';
import { upsertUser } from '../db/user';
import { and, eq, gte, lte } from 'drizzle-orm';
import { logger } from '../utils/logger';

export function registerBotHandlers(bot: Bot<Context>) {
  bot.on('message:text', async (ctx) => {
    const user = await upsertUser(ctx);
    const input = ctx.message.text.trim();
    const parsed = await parseTask(input);
    logger.info('Parsed input', { userId: user.id, input, parsed });
    // await ctx.reply('🤖 明白了，正在处理...');
    await ctx.reply('解析结果：' + JSON.stringify(parsed, null, 2));

    switch (parsed.intent) {
      case 'add_task': {
        const row = toInsertable(input, parsed, user.id);
        const [task] = await db.insert(tasks).values(row).returning();

        if (parsed.clarificationQuestions?.length) {
          await saveClarifications(user.id, task.id, parsed.clarificationQuestions);
          await askNextClarification(user.id, task.id, BigInt(user.tgChatId));
        } else {
          await ctx.reply(`✅ 已添加：${task.title} ${task.startTime ? dayjs(task.startTime).format('HH:mm') : ''}${parsed.explanation ? `
💡 ${parsed.explanation}` : ''}`);
        }
        return;
      }
      case 'mark_done': {
  
const t = await db.query.tasks.findFirst({ where: and(eq(tasks.userId, user.id), eq(tasks.done, false)) });
  if (t) {
    await db.update(tasks).set({ done: true }).where(eq(tasks.id, t.id));
    const timeLabel = t.startTime ? ` ${dayjs(t.startTime).format('HH:mm')}` : '';
    await ctx.reply(`✅ 已标记完成：${t.title}${timeLabel}`);
  } else {
    await ctx.reply('📋 目前没有未完成的任务');
  }
  return;

      }
      case 'query_tasks': {
        const start = dayjs().startOf('day').toDate();
        const end = dayjs().endOf('day').toDate();
        const list = await db.select().from(tasks)
          .where(and(eq(tasks.userId, user.id), gte(tasks.startTime, start), lte(tasks.startTime, end)));
        if (!list.length) {
          await ctx.reply('📋 今天还没有任务。');
        } else {
          const lines = list.map((t) => `• ${t.done ? '✅' : '🕒'} ${t.title}${t.startTime ? ' - ' + dayjs(t.startTime).format('HH:mm') : ''}`);
          await ctx.reply(`📋 今日任务：    ${lines.join('\n')}`);
        }
        return;
      }
      case 'cancel_task': {
        const t = await db.query.tasks.findFirst({ where: and(eq(tasks.userId, user.id), eq(tasks.done, false)) });
        if (t) {
          await db.delete(tasks).where(eq(tasks.id, t.id));
        }
        await ctx.reply('🗑 已取消最近一个任务');
        return;
      }
      case 'smalltalk': {
        await ctx.reply('🙂 明白～我们继续。');
        return;
      }
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const user = await upsertUser(ctx);
    const data = ctx.callbackQuery.data!;

    if (data.startsWith('done_')) {
      const id = Number(data.split('_')[1]);
      await db.update(tasks).set({ done: true }).where(eq(tasks.id, id));
      await ctx.answerCallbackQuery({ text: '完成啦！' });
    } else if (data.startsWith('snooze_')) {
      const [_, idStr, minStr] = data.split('_');
      const id = Number(idStr);
      const mins = Number(minStr);
      const until = dayjs().add(mins, 'minute').toDate();
      await db.update(tasks).set({ snoozedUntil: until, notified: false }).where(eq(tasks.id, id));
      await ctx.answerCallbackQuery({ text: `已推迟${mins}分钟` });
    } else if (data.startsWith('cancel_')) {
      const id = Number(data.split('_')[1]);
      await db.delete(tasks).where(eq(tasks.id, id));
      await ctx.answerCallbackQuery({ text: '已取消' });
    } else if (data.startsWith('applySuggestion_')) {
      const [, blockedId, newTime] = data.split('_');
      if (newTime) {
        await db.update(tasks).set({ startTime: new Date(newTime), notified: false }).where(eq(tasks.id, Number(blockedId)));
      }
      await ctx.answerCallbackQuery({ text: '已采纳建议' });
    } else if (data.startsWith('applyCombo_')) {
      const ids = data.replace('applyCombo_', '').split(',').map(Number);
      await applyCombo(ids, 'AI建议合并', user.id);
      await ctx.answerCallbackQuery({ text: '已合并' });
    } else if (data === 'applyReplan') {
      await ctx.answerCallbackQuery({ text: '已应用重排' });
    } else if (data === 'clearExpired') {
      await ctx.answerCallbackQuery({ text: '已清空过期任务' });
    } else if (data.startsWith('clarify_')) {
      const [, taskIdStr, qid, encoded] = data.split('_');
      const taskId = Number(taskIdStr);
      const answer = decodeURIComponent(encoded);

      const finished = await applyClarificationAnswer(user.id, taskId, qid, answer);

      if (finished) {
        await ctx.editMessageText('✅ 已应用你的回答，计划已更新');
      } else {
        await ctx.answerCallbackQuery();
        await askNextClarification(user.id, taskId, BigInt(user.tgChatId));
      }
    }
  });
}
