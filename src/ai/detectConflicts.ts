// src/ai/detectConflicts.ts
import { openai } from "../utils/openaiClient";

export async function detectConflicts(taskPool: any[]) {
  const tool = {
    type: "function",
    function: {
      name: "detect_conflicts",
      description: "检测任务池的时间/地点/专注/在家等冲突，并给出建议与原因",
      parameters: {
        type: "object",
        properties: {
          conflicts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                blockingTaskId: { type: "number" },
                blockedTaskId: { type: "number" },
                reason: { type: "string" },
                suggestion: { type: "string" },
                newStartTime: { type: "string", nullable: true }
              },
              required: ["blockingTaskId","blockedTaskId","reason","suggestion"]
            }
          },
          overallRecommendation: { type: "string" }
        },
        required: ["conflicts"]
      }
    }
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    tools: [tool],
    tool_choice: { type: "function", function: "detect_conflicts" },
    messages: [
      { role: "system", content: "根据任务池返回冲突与建议；偏向安全与高优先级任务。" },
      { role: "user", content: JSON.stringify(taskPool) }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  return JSON.parse(call!.function.arguments);
}
