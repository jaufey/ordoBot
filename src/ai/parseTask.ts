// src/ai/parseTask.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import { createChatCompletion } from '../utils/openaiClient';
import { parseRelative, applyRelativeOffset } from '../utils/time';

export type ParseResult = {
  intent: 'add_task' | 'mark_done' | 'query_tasks' | 'cancel_task' | 'smalltalk';
  title?: string | null;
  category?: string | null;
  location?: string | null;
  tags?: string[];
  startTime?: string | null;
  estimatedDuration?: number | null;
  priority: 'low' | 'normal' | 'high';
  contextConstraints?: Record<string, boolean>;
  conditionConstraints?: Record<string, unknown>;
  explanation?: string | null;
  clarificationQuestions?: Array<{ id: string; question: string; options?: string[]; explanation?: string }>;
  suggestedTasks?: Array<{ title: string; estimatedDuration: number; reason?: string }>;
  relativeOffsetMinutes?: number | null;
};

export async function parseTask(rawInput: string): Promise<ParseResult> {
  // 先做本地轻量“相对时间”解析（保证确定性）
  const rel = parseRelative(rawInput);

  const tools: ChatCompletionTool[] = [{
    type: 'function',
    function: {
      name: 'parse_task',
      description: '解析自然语言任务/指令并抽取结构化字段与意图',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['add_task', 'mark_done', 'query_tasks', 'cancel_task', 'smalltalk'] },
          title: { type: 'string', nullable: true },
          category: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          tags: { type: 'array', items: { type: 'string' } },
          startTime: { type: 'string', format: 'date-time', nullable: true },
          estimatedDuration: { type: 'number', nullable: true },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          contextConstraints: { type: 'object', additionalProperties: { type: 'boolean' } },
          conditionConstraints: { type: 'object', additionalProperties: true },
          explanation: { type: 'string', nullable: true },
          clarificationQuestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                explanation: { type: 'string' }
              },
              required: ['id', 'question']
            }
          },
          suggestedTasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                estimatedDuration: { type: 'number' },
                reason: { type: 'string' }
              },
              required: ['title', 'estimatedDuration']
            }
          }
        },
        required: ['intent', 'priority']
      }
    }
  }];

  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'parse_task' } };

  const res = await createChatCompletion('parseTask', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: '你是任务解析器；按 schema 返回结构化参数；若时间为相对表达，可留空 startTime。' },
      { role: 'user', content: rawInput }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  const parsed = JSON.parse(call!.function.arguments) as ParseResult;

  if (rel.offsetMinutes && !parsed.startTime) {
    parsed.relativeOffsetMinutes = rel.offsetMinutes;
  }
  return parsed;
}

export function toInsertable(rawInput: string, parsed: ParseResult, userId: number) {
  const start = parsed.startTime
    ? new Date(parsed.startTime)
    : applyRelativeOffset(parsed.relativeOffsetMinutes ?? undefined);

  return {
    userId,
    rawInput,
    intent: parsed.intent,
    title: parsed.title ?? '(未命名)',
    category: parsed.category ?? null,
    location: parsed.location ?? null,
    tags: parsed.tags ?? [],
    startTime: start ?? null,
    estimatedDuration: parsed.estimatedDuration ?? null,
    priority: parsed.priority,
    contextConstraints: parsed.contextConstraints ?? {},
    conditionConstraints: parsed.conditionConstraints ?? {},
    explanation: parsed.explanation ?? null,
    relativeOffsetMinutes: parsed.relativeOffsetMinutes ?? null
  };
}
