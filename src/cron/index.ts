// src/cron/index.ts
import cron from "node-cron";
import { notifyDueTasks } from "../core/notifier";
import { runConflictDetection } from "../core/conflictHandler";
import { runComboSuggest } from "../core/comboHandler";
import { runReplan } from "../core/replanHandler";

// 每分钟：到点提醒
cron.schedule("*/1 * * * *", async () => { await notifyDueTasks(); });

// 每5分钟：冲突检测
cron.schedule("*/5 * * * *", async () => { await runConflictDetection(); });

// 每15分钟：合并建议
cron.schedule("*/15 * * * *", async () => { await runComboSuggest(); });

// 每10分钟：过期重排
cron.schedule("*/10 * * * *", async () => { await runReplan(); });
