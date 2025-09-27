// src/core/derivedTasks.ts
import dayjs from 'dayjs';
import { db } from '../db';
import { tasks } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import type { DerivedTask } from '../ai/parseTask';

type TaskRow = typeof tasks.$inferSelect;

const CREATED_BY_PRE = 'pre_task';
const CREATED_BY_POST = 'post_task';

export async function createPreTasks(mainTask: TaskRow, derived: DerivedTask[] | null | undefined): Promise<TaskRow[]> {
  if (!derived?.length) return [];
  const rows = derived.map((dt) => {
    const startTime = computeDerivedStartTime(mainTask.startTime, dt.relativeOffsetMinutes, dt.startTime);
    const relativeOffsetMinutes = dt.relativeOffsetMinutes ?? computeRelativeOffset(mainTask.startTime, startTime);
    return {
      userId: mainTask.userId,
      rawInput: `[auto] ${dt.title}`,
      intent: 'add_task',
      title: dt.title,
      category: mainTask.category ?? null,
      tags: [],
      startTime,
      estimatedDuration: dt.estimatedDuration ?? null,
      relativeOffsetMinutes,
      priority: (dt.priority ?? 'normal'),
      explanation: dt.reason ?? null,
      contextConstraints: {},
      conditionConstraints: {},
      parentTaskId: mainTask.id,
      createdBy: CREATED_BY_PRE
    };
  });
  const inserted = await db.insert(tasks).values(rows).returning();
  return inserted;
}

export async function createPostTasks(mainTask: TaskRow, derived: DerivedTask[] | null | undefined): Promise<TaskRow[]> {
  if (!derived?.length) return [];
  const rows = derived.map((dt) => {
    const startTime = dt.startTime ? new Date(dt.startTime) : null;
    const relativeOffsetMinutes = dt.relativeOffsetMinutes ?? null;
    return {
      userId: mainTask.userId,
      rawInput: `[auto] ${dt.title}`,
      intent: 'add_task',
      title: dt.title,
      category: mainTask.category ?? null,
      tags: [],
      startTime,
      estimatedDuration: dt.estimatedDuration ?? null,
      relativeOffsetMinutes,
      priority: (dt.priority ?? 'normal'),
      explanation: dt.reason ?? null,
      contextConstraints: {},
      conditionConstraints: {},
      parentTaskId: mainTask.id,
      createdBy: CREATED_BY_POST
    };
  });
  const inserted = await db.insert(tasks).values(rows).returning();
  return inserted;
}

export async function activatePostTasks(parentTaskId: number): Promise<TaskRow[]> {
  const pending = await db.select().from(tasks).where(
    and(
      eq(tasks.parentTaskId, parentTaskId),
      eq(tasks.createdBy, CREATED_BY_POST),
      eq(tasks.done, false)
    )
  );

  const results: TaskRow[] = [];
  for (const post of pending) {
    const shouldUpdate = !post.startTime;
    const startTime = post.startTime ?? computeDerivedStartTime(null, post.relativeOffsetMinutes, null);
    if (shouldUpdate) {
      const [updated] = await db.update(tasks)
        .set({ startTime, notified: false, followupCount: 0, lastReminderAt: null })
        .where(eq(tasks.id, post.id))
        .returning();
      results.push(updated);
    } else {
      results.push(post);
    }
  }
  return results;
}

function computeDerivedStartTime(base: Date | null, offsetMinutes?: number | null, explicit?: string | null) {
  if (explicit) return new Date(explicit);
  if (offsetMinutes != null && !Number.isNaN(offsetMinutes)) {
    const baseDayjs = base ? dayjs(base) : dayjs();
    return baseDayjs.add(offsetMinutes, 'minute').toDate();
  }
  return null;
}

function computeRelativeOffset(base: Date | null, target: Date | null) {
  if (!base || !target) return null;
  return dayjs(target).diff(dayjs(base), 'minute');
}
