// src/core/scheduler.ts
import dayjs from 'dayjs';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import { tasks } from '../db/schema';

export function backwardByDuration(startTime: Date | null, minutes?: number | null) {
  if (!startTime || !minutes) {
    return { startTime, endTime: startTime ?? null };
  }
  const endTime = startTime;
  const start = dayjs(startTime).subtract(minutes, 'minute').toDate();
  return { startTime: start, endTime };
}

export async function insertTask(insertable: any) {
  const withTimes = backwardByDuration(insertable.startTime, insertable.estimatedDuration);
  await db.insert(tasks).values({ ...insertable, ...withTimes });
}

export async function getUpcomingTasks(userId: number, minutesAhead = 180) {
  const now = dayjs();
  const end = now.add(minutesAhead, 'minute').toDate();
  return await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.done, false),
        or(isNull(tasks.snoozedUntil), lt(tasks.snoozedUntil, new Date())),
        gt(tasks.startTime, now.toDate()),
        lt(tasks.startTime, end)
      )
    )
    .orderBy(tasks.startTime);
}

export async function getExpiredUnfinished(userId: number) {
  const now = new Date();
  return await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.done, false), lt(tasks.startTime, now)))
    .orderBy(tasks.startTime);
}
