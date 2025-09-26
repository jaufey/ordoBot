// src/cron/replanCron.ts
import cron from "node-cron";
import { db } from "../db/index";
import { tasks } from "../db/schema";
import { replanTasks } from "../ai/replanTasks";
import { bot } from "../bot/index";

cron.schedule("*/10 * * * *", async () => {
  const expired = await db.select().from(tasks).where(tasks.done.eq(false)); // 简化版
  if (!expired.length) return;

  const replan = await replanTasks(expired);
  await bot.api.sendMessage(process.env.ADMIN_CHAT_ID!, `${replan.encouragement}\n\n${JSON.stringify(replan.replan, null, 2)}`);
});
