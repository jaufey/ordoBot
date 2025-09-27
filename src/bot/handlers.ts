// src/bot/handlers.ts
import dayjs from 'dayjs';
import type { Bot, Context } from 'grammy';
import { parseTask, toInsertable } from '../ai/parseTask';
import { db } from '../db';
import { tasks } from '../db/schema';
import { applyCombo } from '../core/comboHandler';
import { saveClarifications, askNextClarification, applyClarificationAnswer } from '../core/clarificationFlow';
import { createPreTasks, createPostTasks, activatePostTasks } from '../core/derivedTasks';
import { upsertUser } from '../db/user';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';
const priorityIcons = { low: '🟢', normal: '🟡', high: '🔴' } as const;
export function registerBotHandlers(bot: Bot<Context>) {
  bot.on('message:text', async (ctx) => {
    const user = await upsertUser(ctx);
    const input = ctx.message.text.trim();
    await ctx.reply('🤖 明白了，正在处理...');
    const parsed = await parseTask(input);
    logger.info('Parsed input', { userId: user.id, input, parsed });
    
    // 输出解析结果，避免 BigInt 序列化报错
    await ctx.reply(`解析结果：
${JSON.stringify(parsed, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}`);
    switch (parsed.intent) {
      case 'add_task': {
        const row = toInsertable(input, parsed, user.id);
        const [task] = await db.insert(tasks).values(row).returning();
        const createdPre = await createPreTasks(task, parsed.preTasks);
        const createdPost = await createPostTasks(task, parsed.postTasks);
        if (parsed.clarificationQuestions?.length) {
          await saveClarifications(user.id, task.id, parsed.clarificationQuestions);
          await askNextClarification(user.id, task.id, BigInt(user.tgChatId));
        } else {
          await ctx.reply(`✅ 已添加：${task.title} ${task.startTime ? dayjs(task.startTime).format('HH:mm') : ''}${parsed.explanation ? `
💡 ${parsed.explanation}` : ''}`);
        }
        if (createdPre.length) {
          const lines = createdPre.map((t) => {
            const timeLabel = t.startTime ? dayjs(t.startTime).format('MM-DD HH:mm') : '时间待定';
            return `• 🛠 ${t.title} (${timeLabel})`;
          });
          await ctx.reply(`🧾 已安排前置任务：
${lines.join('\n')}`);
        }
        if (createdPost.length) {
          const lines = createdPost.map((t) => {
            const info = t.relativeOffsetMinutes != null
              ? `+${t.relativeOffsetMinutes} 分钟`
              : (t.startTime ? dayjs(t.startTime).format('MM-DD HH:mm') : '触发后安排');
            return `• 🔁 ${t.title} (${info})`;
          });
          await ctx.reply(`⏭ 已记录完成后的跟进任务：
${lines.join('\n')}
当主要任务完成时我会提醒你是否启动这些任务。`);
        }
        return;
      }
      case 'mark_done': {
        const t = await db.query.tasks.findFirst({ where: and(eq(tasks.userId, user.id), eq(tasks.done, false)) });
        if (t) {
          await db.update(tasks).set({ done: true }).where(eq(tasks.id, t.id));
          const timeLabel = t.startTime ? ` ${dayjs(t.startTime).format('HH:mm')}` : '';
          await ctx.reply(`✅ 已标记完成：${t.title}${timeLabel}`);
          const activated = await activatePostTasks(t.id);
          if (activated.length) {
            const followUps = activated.map((ft) => {
              const timeLabel = ft.startTime ? dayjs(ft.startTime).format('MM-DD HH:mm') : '时间待定';
              return `• 🔁 ${ft.title} (${timeLabel})`;
            });
            await ctx.reply(`⏭ 已安排后续任务：
${followUps.join('\n')}`);
          }
        } else {
          await ctx.reply('📋 目前没有未完成的任务');
        }
        return;
      }
      case 'query_tasks': {
        const filters = parsed.queryFilters ?? {};
        const whereClauses = [eq(tasks.userId, user.id)];
        const now = dayjs();
        if (typeof filters.done === 'boolean') {
          whereClauses.push(eq(tasks.done, filters.done));
        } else {
          whereClauses.push(eq(tasks.done, false));
        }
        if (typeof filters.notified === 'boolean') {
          whereClauses.push(eq(tasks.notified, filters.notified));
        }
        if (filters.priorities?.length) {
          whereClauses.push(inArray(tasks.priority, filters.priorities));
        }
        const dateFilter = filters.date;
        let startBound: Date | undefined;
        let endBound: Date | undefined;
        if (dateFilter) {
          switch (dateFilter.preset) {
            case 'today': {
              startBound = now.startOf('day').toDate();
              endBound = now.endOf('day').toDate();
              break;
            }
            case 'tomorrow': {
              const d = now.add(1, 'day');
              startBound = d.startOf('day').toDate();
              endBound = d.endOf('day').toDate();
              break;
            }
            case 'day_after_tomorrow': {
              const d = now.add(2, 'day');
              startBound = d.startOf('day').toDate();
              endBound = d.endOf('day').toDate();
              break;
            }
            case 'now': {
              startBound = now.toDate();
              break;
            }
          }
          if (dateFilter.start) {
            const parsedStart = dayjs(dateFilter.start);
            if (parsedStart.isValid()) {
              startBound = parsedStart.toDate();
            }
          }
          if (dateFilter.end) {
            const parsedEnd = dayjs(dateFilter.end);
            if (parsedEnd.isValid()) {
              endBound = parsedEnd.toDate();
            }
          }
        }
        if (startBound) {
          whereClauses.push(gte(tasks.startTime, startBound));
        }
        if (endBound) {
          whereClauses.push(lte(tasks.startTime, endBound));
        }
        const where = whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses);
        const list = await db.select().from(tasks).where(where).orderBy(tasks.startTime);
        if (!list.length) {
          await ctx.reply('📋 未找到符合条件的任务。');
        } else {
          const lines = list.map((t) => {
            const status = t.done ? '✅' : '🕒';
            const priorityKey = (t.priority ?? 'normal').toLowerCase();
            const priority = priorityIcons[priorityKey as keyof typeof priorityIcons] ?? '🟡';
            const timeLabel = t.startTime ? dayjs(t.startTime).format('MM-DD HH:mm') : '未安排时间';
            return `• ${status} ${priority} ${t.title} (${timeLabel})`;
          });
          await ctx.reply(`📋 任务列表：
${lines.join('\n')}`);
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
      const activated = await activatePostTasks(id);
      if (activated.length) {
        const followUps = activated.map((ft) => {
          const timeLabel = ft.startTime ? dayjs(ft.startTime).format('MM-DD HH:mm') : '时间待定';
          return `• 🔁 ${ft.title} (${timeLabel})`; 
        });
        await ctx.reply(`⏭ 已安排后续任务：
${followUps.join('\n')}`);
      }
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
    } else if (data.startsWith('ignoreSuggestion_')) {
      await ctx.answerCallbackQuery({ text: '已保持原计划' });
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
