// src/ai/detectConflicts.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import { createChatCompletion } from '../utils/openaiClient';

export async function detectConflicts(taskPool: any[]) {
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
                newStartTime: { type: 'string', nullable: true }
              },
              required: ['blockingTaskId', 'blockedTaskId', 'reason', 'suggestion']
            }
          },
          overallRecommendation: { type: 'string' }
        },
        required: ['conflicts']
      }
    }
  }];

  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'detect_conflicts' } };

  const res = await createChatCompletion('detectConflicts', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: '根据任务池返回可能的冲突及建议，并优先保障安全与高优先级任务。' },
      { role: 'user', content: JSON.stringify(taskPool) }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  return JSON.parse(call!.function.arguments);
}
