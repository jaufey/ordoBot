// src/bot/index.ts
import { Bot } from "grammy";
import { parseTask } from "../ai/parseTask";
import { insertTask } from "../core/scheduler";

export const bot = new Bot(process.env.BOT_TOKEN!);

bot.on("message:text", async (ctx) => {
  const parsed = await parseTask(ctx.message.text);
  await insertTask(parsed);
  await ctx.reply(`任务已添加: ${parsed.title} ${parsed.startTime ?? ""}`);
});
