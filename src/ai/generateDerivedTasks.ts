// src/ai/generateDerivedTasks.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { DerivedTask, ParseResult } from './parseTask';
import { createChatCompletion } from '../utils/openaiClient';

export type DerivedTaskPlan = {
  preTasks: DerivedTask[] | null;
  postTasks: DerivedTask[] | null;
};

const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_derived_tasks',
      description: '生成一个任务的前置/后置衍生任务列表',
      parameters: {
        type: 'object',
        properties: {
          preTasks: {
            type: 'array',
            nullable: true,
            description: '在主要任务开始之前需要完成的准备任务列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '任务标题' },
                estimatedDuration: { type: 'number', nullable: true, description: '预计用时，分钟' },
                relativeOffsetMinutes: { type: 'number', nullable: true, description: '相对主任务的分钟偏移，可为负数' },
                startTime: { type: 'string', nullable: true, format: 'date-time', description: '明确的开始时间（如果可以确定）' },
                priority: { type: 'string', nullable: true, enum: ['low', 'normal', 'high'], description: '优先级' },
                reason: { type: 'string', nullable: true, description: '为什么需要这个任务' }
              },
              required: ['title']
            }
          },
          postTasks: {
            type: 'array',
            nullable: true,
            description: '在主要任务完成后需要跟进的任务列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '任务标题' },
                estimatedDuration: { type: 'number', nullable: true, description: '预计用时，分钟' },
                relativeOffsetMinutes: { type: 'number', nullable: true, description: '相对主任务完成后的分钟偏移，可为负数' },
                startTime: { type: 'string', nullable: true, format: 'date-time', description: '明确的开始时间（如果可以确定）' },
                priority: { type: 'string', nullable: true, enum: ['low', 'normal', 'high'], description: '优先级' },
                reason: { type: 'string', nullable: true, description: '为什么需要这个任务' }
              },
              required: ['title']
            }
          }
        }
      }
    }
  }
];

const toolChoice: ChatCompletionNamedToolChoice = {
  type: 'function',
  function: { name: 'generate_derived_tasks' }
};

const systemPrompt = `
You are an assistant that designs preparatory and follow-up tasks for a given primary task.

Guidelines:
1. 只有在确实有帮助时才输出 preTasks 或 postTasks；否则返回 null。
2. 每个任务保持简洁明确，标题 3-12 个字为宜。
3. 仅在必要时填写 startTime，通常优先给出 relativeOffsetMinutes。
4. estimatedDuration 估算到分钟，若无法判断可以设为 null。
5. 如果主任务已经很简单，不要强行生成衍生任务。
`;

const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

function buildContext(rawInput: string, parsed: ParseResult) {
  const context = {
    rawInput,
    title: parsed.title ?? null,
    explanation: parsed.explanation ?? null,
    startTime: parsed.startTime ?? null,
    relativeOffsetMinutes: parsed.relativeOffsetMinutes ?? null,
    estimatedDuration: parsed.estimatedDuration ?? null,
    priority: parsed.priority ?? null,
    category: parsed.category ?? null,
    contextConstraints: parsed.contextConstraints ?? null,
    conditionConstraints: parsed.conditionConstraints ?? null,
    tags: parsed.tags ?? null
  };
  return JSON.stringify(context, replacer, 2);
}

export async function generateDerivedTasks(rawInput: string, parsed: ParseResult): Promise<DerivedTaskPlan> {
  if (parsed.intent !== 'add_task') {
    return { preTasks: null, postTasks: null };
  }

  const userMessage = `主任务原始输入:
${rawInput}

主任务结构化信息:
${buildContext(rawInput, parsed)}`;

  const res = await createChatCompletion('generateDerivedTasks', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: systemPrompt.trim() },
      { role: 'user', content: userMessage }
    ]
  });

  const call = res.choices[0].message.tool_calls?.[0];
  if (!call) {
    return { preTasks: null, postTasks: null };
  }
  const parsedResult = JSON.parse(call.function.arguments) as DerivedTaskPlan;
  return {
    preTasks: parsedResult.preTasks ?? null,
    postTasks: parsedResult.postTasks ?? null
  };
}
