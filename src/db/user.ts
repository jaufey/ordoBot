// src/bot/user.ts
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Context } from "grammy";

export async function upsertUser(ctx: Context) {
  const tgUserId = BigInt(ctx.from!.id);
  const tgChatId = BigInt(ctx.chat!.id);
  const username = ctx.from!.username ?? null;

  const existing = await db.query.users.findFirst({ where: eq(users.tgUserId, tgUserId) });
  if (existing) {
    if (existing.tgChatId !== tgChatId) {
      await db.update(users).set({ tgChatId }).where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [u] = await db.insert(users).values({ tgUserId, tgChatId, username }).returning();
  return u;
}
