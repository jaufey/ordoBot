// src/ai/suggestCombos.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import { createChatCompletion } from '../utils/openaiClient';

export async function suggestCombos(taskPool: any[]) {
  const tools: ChatCompletionTool[] = [{
    type: 'function',
    function: {
      name: 'suggest_combos',
      description: '基于地点或目的相近的任务提供合并执行建议，避免过度合并',
      parameters: {
        type: 'object',
        properties: {
          combos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                taskIds: { type: 'array', items: { type: 'number' } },
                reason: { type: 'string' }
              },
              required: ['taskIds', 'reason']
            }
          }
        },
        required: ['combos']
      }
    }
  }];

  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'suggest_combos' } };

  const res = await createChatCompletion('suggestCombos', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: '识别可以顺路或同地办理的任务，给出合并理由，避免过度合并。' },
      { role: 'user', content: JSON.stringify(taskPool) }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  return JSON.parse(call!.function.arguments) as { combos: Array<{ taskIds: number[]; reason: string }> };
}
