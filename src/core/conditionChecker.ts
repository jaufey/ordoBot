// src/core/conditionChecker.ts
import dayjs from "dayjs";
import { ConditionConstraints } from "../db/schema";

export async function checkConditions(task: { conditionConstraints?: ConditionConstraints }) {
  const cc = task.conditionConstraints ?? {};
  const hour = dayjs().hour();

  if (cc.timeOfDay === "morning" && hour >= 12) return false;
  if (cc.timeOfDay === "afternoon" && (hour < 12 || hour >= 18)) return false;
  if (cc.timeOfDay === "evening" && hour < 18) return false;

  // weather/定位后续接API，这里先返回true
  return true;
}
