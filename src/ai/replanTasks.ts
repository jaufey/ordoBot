// src/ai/replanTasks.ts
import { createChatCompletion } from '../utils/openaiClient';

export async function replanTasks(expiredTasks: any[]) {
  const prompt = `
你是贴心的日程管家。以下任务已经过期，请按优先级/安全性给出重排方案，并用温柔语气给一句鼓励。
输出JSON: { "replan": [{ "taskId": number, "newStartTime": string, "reason": string }], "encouragement": string, "summary": string }
`;
  const res = await createChatCompletion('replanTasks', {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(expiredTasks) }
    ],
    response_format: { type: "json_object" }
  });
  return JSON.parse(res.choices[0].message.content);
}
