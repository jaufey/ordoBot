// src/utils/time.ts
import dayjs from "dayjs";

// 支持：10分钟后 / 2小时后 / 明天8点（简单版）
export function parseRelative(input: string): { offsetMinutes?: number } {
  const m = input.match(/(\d+)\s*(分钟|分|小时|h)\s*后/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const offsetMinutes = unit.includes("时") || unit.toLowerCase() === "h" ? n * 60 : n;
    return { offsetMinutes };
  }
  return {};
}

export function applyRelativeOffset(offsetMinutes?: number): Date | undefined {
  if (offsetMinutes == null) return;
  return dayjs().add(offsetMinutes, "minute").toDate();
}
