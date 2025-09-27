// src/ai/detectConflicts.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import { createChatCompletion } from '../utils/openaiClient';

export async function detectConflicts(taskPool: any[]) {
    if (taskPool.length < 2) return null; // 没有可比较的任务

  const tools: ChatCompletionTool[] = [{
    type: 'function',
    function: {
      name: 'detect_conflicts',
      description: '检测任务池的时间、地点、专注度与环境冲突，并提供建议',
      parameters: {
        type: 'object',
        properties: {
          conflicts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                blockingTaskId: { type: 'number' },
                blockedTaskId: { type: 'number' },
                reason: { type: 'string' },
                suggestion: { type: 'string' },
                newStartTime: { type: 'string', format: 'date-time', description: '新的开始时间，必须是可执行的绝对时间' }
              },
              required: ['blockingTaskId', 'blockedTaskId', 'reason', 'suggestion', 'newStartTime']
            }
          },
          overallRecommendation: { type: 'string' }
        },
        required: ['conflicts']
      }
    }
  }];

  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'detect_conflicts' } };

  const systemPrompt = `You are a scheduling assistant. 
You will receive a list of tasks with startTime, estimatedDuration, contextConstraints, ConditionConstraints, and priority.  

Your job:
1. Detect if there are conflicts that would prevent the user from completing tasks properly (e.g. being outside when a high-priority indoor task is due).
2. Output a JSON object with:
    - conflicts: array of { blockingTaskId, blockedTaskId, reason, suggestion }
    - overallRecommendation: string explaining what the user might want to do (e.g. delay one task)
3. Always combine startTime with estimatedDuration (minutes) to derive each task's execution window (endTime = startTime + estimatedDuration, default 0). Use these windows alongside contextConstraints, conditionConstraints, priority, and location requirements to detect conflicts and propose newStartTime values that keep the blocked task clear of all other tasks in the pool, including later ones.

Output JSON with this structure:
{
  "conflicts": [
    {
      "blockingTaskId": number,
      "blockedTaskId": number,
      "reason": string,
      "suggestion": string,
      "newStartTime": string
    }
  ],
  "overallRecommendation": string
}

Rules:
- For every conflict you must provide a concrete newStartTime in ISO8601 format for the blocked task; the rescheduled time must eliminate the conflict.
- Treat tasks with priority=high as more important than normal/low.
- If one task's duration overlaps another and they require different locations, consider it a conflict.
- If one task requiresFocus=true, avoid scheduling other tasks during that time.
- Note: The fields inside contextConstraints and conditionConstraints are not fixed. You can treat them as tags and use your common sense to infer whether they might cause conflicts.
- Suggest safe adjustments, like delaying a lower-priority task by a few minutes.
- Keep suggestions polite and concise.

Example input:
{
  "tasks": [
    {
      "id": 1,
      "title": "关煮蛋器",
      "startTime": "2025-09-26T20:05:00+08:00",
      "contextConstraints": { "requiresFocus": true, "mustBeIndoor": true, "location": "home" },
      "priority": "high",
      "estimatedDuration": 1
    },
    {
      "id": 2,
      "title": "散步",
      "startTime": "2025-09-26T20:00:00+08:00",
      "contextConstraints": { "requiresFocus": false, "mustBeIndoor": false, "location": "outdoor" },
      "priority": "normal",
      "estimatedDuration": 30
    }
  ]
}


Example output:
{
  "conflicts": [
    {
      "blockingTaskId": 1,
      "blockedTaskId": 2,
      "reason": "关煮蛋器是高优先级任务，且必须在家。散步会让你无法在20:05回家执行。",
      "suggestion": "推迟散步10分钟，先关煮蛋器再出门",
      "newStartTime": "2025-09-26T20:10:00+08:00"
    }
],
 "overallRecommendation": "建议先关掉煮蛋器，再开始散步，以免电器长时间无人看管"
}
`;

  const res = await createChatCompletion('detectConflicts', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: systemPrompt.trim() },
      { role: 'user', content: JSON.stringify(taskPool) }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  return JSON.parse(call!.function.arguments);
}
