// src/bot/handlers.ts
import dayjs from "dayjs";
import { bot } from "./index";
import { parseTask, toInsertable } from "../ai/parseTask";
import { db } from "../db";
import { tasks, clarifications } from "../db/schema";
import { insertTask } from "../core/scheduler";
import { applyCombo } from "../core/comboHandler";
import { eq ,and} from "drizzle-orm";
import { upsertUser } from "./user";
import { saveClarifications, askNextClarification, applyClarificationAnswer } from "../core/clarificationFlow";

bot.on("message:text", async (ctx) => {
  
   const user = await upsertUser(ctx);
  const input = ctx.message.text.trim();
  const parsed = await parseTask(input);

  // —— Intent 路由 —— //
  switch (parsed.intent) {
    case "add_task": {
       const row = toInsertable(input, parsed, user.id);
      const [task] = await db.insert(tasks).values(row).returning();

      // 追问
      if (parsed.clarificationQuestions?.length) {
        await saveClarifications(user.id, task.id, parsed.clarificationQuestions!);
        await askNextClarification(user.id, task.id, BigInt(user.tgChatId));
      } else {
        await ctx.reply(`✅ 已添加：${task.title} ${task.startTime ? dayjs(task.startTime).format("HH:mm") : ""}${parsed.explanation ? `\n💡 ${parsed.explanation}` : ""}`);
      }
      return;
    }
    case "mark_done": {
        // 生产中应带 task 指示；这里示例“最近的未完成”
      const t = await db.query.tasks.findFirst({ where: and(eq(tasks.userId, user.id), eq(tasks.done, false)) });
      if (t) await db.update(tasks).set({ done: true }).where(eq(tasks.id, t.id));
      await ctx.reply("✅ 已标记完成");
      return;
    }
    case "query_tasks": {
         // 今日任务（本地时区粗略版）
      const start = dayjs().startOf("day").toDate();
      const end = dayjs().endOf("day").toDate();
      const list = await db.select().from(tasks)
        .where(and(eq(tasks.userId, user.id), gte(tasks.startTime, start), lte(tasks.startTime, end)));
      if (!list.length) {
        await ctx.reply("📋 今天还没有任务。");
      } else {
        const lines = list.map(t =>
          `• ${t.done ? "✅" : "🕒"} ${t.title}${t.startTime ? " - " + dayjs(t.startTime).format("HH:mm") : ""}`
        );
        await ctx.reply(`📋 今日任务：\n${lines.join("\n")}`);
      }
      return;
    }
    case "cancel_task": {
     const t = await db.query.tasks.findFirst({ where: and(eq(tasks.userId, user.id), eq(tasks.done, false)) });
      if (t) await db.delete(tasks).where(eq(tasks.id, t.id));
      await ctx.reply("🗑 已取消最近一个任务");
      return;
    }
    case "smalltalk": {
      await ctx.reply("🙂 明白～我们继续。");
      return;
    }
  }
});

// —— 回调：完成/推迟/取消/采纳建议/合并 —— //
bot.on("callback_query:data", async (ctx) => {

 const user = await upsertUser(ctx);
  const data = ctx.callbackQuery.data!;

  if (data.startsWith("done_")) {
    const id = Number(data.split("_")[1]);
    await db.update(tasks).set({ done: true }).where(eq(tasks.id, id));
    await ctx.answerCallbackQuery({ text: "完成啦！" });
  } else if (data.startsWith("snooze_")) {
    const [_, idStr, minStr] = data.split("_");
    const id = Number(idStr); const mins = Number(minStr);
    const until = dayjs().add(mins, "minute").toDate();
    await db.update(tasks).set({ snoozedUntil: until, notified: false }).where(eq(tasks.id, id));
    await ctx.answerCallbackQuery({ text: `已推迟${mins}分钟` });
  } else if (data.startsWith("cancel_")) {
    const id = Number(data.split("_")[1]);
    await db.delete(tasks).where(eq(tasks.id, id));
    await ctx.answerCallbackQuery({ text: "已取消" });
  } else if (data.startsWith("applySuggestion_")) {
    const [, blockedId, newTime] = data.split("_");
    if (newTime) await db.update(tasks).set({ startTime: new Date(newTime), notified: false }).where(eq(tasks.id, Number(blockedId)));
    await ctx.answerCallbackQuery({ text: "已采纳建议" });
  } else if (data.startsWith("applyCombo_")) {
    const ids = data.replace("applyCombo_", "").split(",").map(Number);
    await applyCombo(ids, "AI建议合并");
    await ctx.answerCallbackQuery({ text: "已合并" });
  } else if (data === "applyReplan") {
    // 这里应缓存 replan 结果；演示略
    await ctx.answerCallbackQuery({ text: "已应用重排" });
  } else if (data === "clearExpired") {
    // 清理过期；演示略
    await ctx.answerCallbackQuery({ text: "已清空过期任务" });
  } else if (data.startsWith("clarify_")) {
    
    const [, taskIdStr, qid, encoded] = data.split("_");
    const taskId = Number(taskIdStr);
    const answer = decodeURIComponent(encoded);

    const finished = await applyClarificationAnswer(user.id, taskId, qid, answer);

    if (finished) {
      // 追问流程结束：这里可以根据已回答内容，插入 suggestedTasks 或重算倒推
      // 示例：把“自动安排”之类的选项转成子任务
      // （如需 AI 参与，可调用一个 apply_clarification 的 FC，这里略）
      await ctx.editMessageText("✅ 已应用你的回答，计划已更新");
    } else {
      await ctx.answerCallbackQuery();
      await askNextClarification(user.id, taskId, BigInt(user.tgChatId));
    }
    return;

  }
});
