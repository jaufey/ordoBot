// src/db/schema.ts
import { pgTable, serial, text, timestamp, boolean, jsonb, integer, bigint } from "drizzle-orm/pg-core";

/** 用户画像与偏好（最小可用 + 可扩展） */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tgUserId: bigint("tg_user_id", { mode: "bigint" }).notNull().unique(),     // Telegram user id
  tgChatId: bigint("tg_chat_id", { mode: "bigint" }).notNull(),              // 当前聊天 chat id
  username: text("username"),
  timezone: text("timezone").default("Asia/Shanghai"),
  locale: text("locale").default("zh-CN"),
  // 情绪/语气 & 提醒偏好
  encouragingTone: boolean("encouraging_tone").default(true),
  defaultSnoozeMinutes: integer("default_snooze_minutes").default(10),
  // 个人习惯/健康偏好（示例）
  profile: jsonb("profile").$type<{
    lactoseIntolerant?: boolean;                 // 乳糖不耐
    preLeaveShower?: boolean;                    // 出门前喜欢洗澡
    diet?: "normal" | "low_sugar" | "keto";      // 饮食偏好
  }>().default({}),
  // 主动性与权限
  trustLevel: integer("trust_level").default(0), // 0-100
  autoplanEnabled: boolean("autoplan_enabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export type ContextConstraints = {
  requiresHome?: boolean;
  requiresFocus?: boolean;
  parallelizable?: boolean;
  [key: string]: unknown;
};
export type ConditionConstraints = {
  weather?: { type: 'not_rainy' | 'clear' } | Record<string, unknown>;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  [key: string]: unknown;
};

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  /** 多租户：全部带 userId */
  userId: integer("user_id").notNull(),

  // 溯源 & 解释 & 意图
  rawInput: text("raw_input").notNull(),
  intent: text("intent").notNull(),                       // add_task / mark_done / ...
  explanation: text("explanation"),
  priorityReason: text("priority_reason"),
  parallelReason: text("parallel_reason"),
  createdBy: text("created_by").default("user"),          // user / ai_suggestion / clarification
  isFollowUpAnswer: boolean("is_followup_answer").default(false),

  // 任务核心
  title: text("title").notNull(),
  category: text("category"),
  tags: jsonb("tags").$type<string[]>().default([]),

  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  estimatedDuration: integer("estimated_duration"),
  relativeOffsetMinutes: integer("relative_offset_minutes"),

  contextConstraints: jsonb("context_constraints").$type<ContextConstraints>().default({}),
  conditionConstraints: jsonb("condition_constraints").$type<ConditionConstraints>().default({}),

  parentTaskId: integer("parent_task_id"),

  // 状态
  done: boolean("done").default(false),
  notified: boolean("notified").default(false),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

/** 多轮追问（clarifications） + 顺序控制 + 会话归属 */
export const clarifications = pgTable("clarifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  taskId: integer("task_id").notNull(),
  questionId: text("question_id").notNull(),
  orderIndex: integer("order_index").default(0),                // 同一任务内的顺序
  question: text("question").notNull(),
  options: jsonb("options"),
  explanation: text("explanation"),
  answered: boolean("answered").default(false),
  answerText: text("answer_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

/** 合并建议（combine） */
export const combos = pgTable("combos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

export const comboItems = pgTable("combo_items", {
  id: serial("id").primaryKey(),
  comboId: integer("combo_id").notNull(),
  taskId: integer("task_id").notNull()
});
