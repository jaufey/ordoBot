// src/ai/parseTask.ts
import type { ChatCompletionNamedToolChoice, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ConditionConstraints, ContextConstraints } from '../db/schema';
import { createChatCompletion } from '../utils/openaiClient';
import { parseRelative, applyRelativeOffset } from '../utils/time';

type ClarificationQuestion = {
  id: string;
  question: string;
  options?: string[];
  explanation?: string | null;
};

type SuggestedTask = {
  title: string;
  estimatedDuration: number;
  reason?: string | null;
};

type QueryDatePreset = 'today' | 'tomorrow' | 'day_after_tomorrow' | 'now';

type QueryDateFilter = {
  preset?: QueryDatePreset | null;
  start?: string | null;
  end?: string | null;
};

type QueryTaskFilters = {
  date?: QueryDateFilter | null;
  done?: boolean | null;
  notified?: boolean | null;
  priorities?: Array<'low' | 'normal' | 'high'> | null;
};

export type ParseResult = {
  intent: 'add_task' | 'mark_done' | 'query_tasks' | 'cancel_task' | 'smalltalk';
  title?: string | null;
  category?: string | null;
  tags?: string[];
  estimatedDuration?: number | null;
  relativeOffsetMinutes?: number | null;
  startTime?: string | null;
  priority?: 'low' | 'normal' | 'high' | null;
  priorityReason?: string | null;
  parallelReason?: string | null;
  contextConstraints?: ContextConstraints | null;
  conditionConstraints?: ConditionConstraints | null;
  explanation?: string | null;
  clarificationQuestions?: ClarificationQuestion[];
  suggestedTasks?: SuggestedTask[];
  isFollowUpAnswer?: boolean | null;
  queryFilters?: QueryTaskFilters | null;
};

export const parseTaskTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'parse_task',
    description: '解析用户自然语言输入为结构化任务',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: ['add_task', 'mark_done', 'query_tasks', 'cancel_task', 'smalltalk'],
          description: '用户意图'
        },
        title: { type: 'string', nullable: true, description: '任务标题，简短明确' },
        category: {
          type: 'string',
          nullable: true,
          description: '任务类别，如 家务 / 购物 / 健康 / 学习'
        },
        tags: {
          type: 'array',
          description: '任务标签关键字数组',
          items: { type: 'string' }
        },
        estimatedDuration: {
          type: 'number',
          nullable: true,
          description: '预计用时（分钟）'
        },
        relativeOffsetMinutes: {
          type: 'number',
          nullable: true,
          description: '相对当前时间的分钟偏移'
        },
        startTime: {
          type: 'string',
          nullable: true,
          format: 'date-time',
          description: '绝对开始时间（ISO8601）'
        },
        priority: {
          type: 'string',
          nullable: true,
          enum: ['low', 'normal', 'high'],
          description: '任务优先级'
        },
        priorityReason: {
          type: 'string',
          nullable: true,
          description: '优先级说明'
        },
        parallelReason: {
          type: 'string',
          nullable: true,
          description: '是否可并行执行及原因'
        },
        contextConstraints: {
          type: 'object',
          nullable: true,
          description: '任务执行的上下文约束',
          additionalProperties: true,
          properties: {
            requiresHome: { type: 'boolean', description: '需要在家执行' },
            requiresFocus: { type: 'boolean', description: '需要专注环境' },
            parallelizable: { type: 'boolean', description: '可与其他任务并行' },
            location: { type: 'string', nullable: true, description: '推荐执行地点，如 家里 / 超市' }
          }
        },
        conditionConstraints: {
          type: 'object',
          nullable: true,
          description: '外部条件约束，比如天气、时段',
          additionalProperties: true,
          properties: {
            weather: {
              type: 'object',
              nullable: true,
              properties: {
                type: { type: 'string', description: '天气条件，例如 not_rainy' }
              }
            },
            timeOfDay: {
              type: 'string',
              nullable: true,
              enum: ['morning', 'afternoon', 'evening'],
              description: '推荐执行时段'
            }
          }
        },
        explanation: {
          type: 'string',
          nullable: true,
          description: '简短解释任务含义'
        },
        clarificationQuestions: {
          type: 'array',
          description: '需要追问用户补充信息的问句列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '问题唯一标识' },
              question: { type: 'string', description: '问题内容' },
              options: {
                type: 'array',
                nullable: true,
                description: '可选答案列表',
                items: { type: 'string' }
              },
              explanation: {
                type: 'string',
                nullable: true,
                description: '额外说明或提示'
              }
            },
            required: ['id', 'question']
          }
        },
        suggestedTasks: {
          type: 'array',
          description: '模型建议拆解出的子任务列表',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '子任务标题' },
              estimatedDuration: { type: 'number', description: '子任务预计用时（分钟）' },
              reason: { type: 'string', nullable: true, description: '产生该子任务的原因' }
            },
            required: ['title', 'estimatedDuration']
          }
        },
        isFollowUpAnswer: {
          type: 'boolean',
          nullable: true,
          description: '标记是否为追问后的回答'
        },
        queryFilters: {
          type: 'object',
          nullable: true,
          description: '查询任务时的筛选条件，仅 intent = query_tasks 时使用',
          additionalProperties: true,
          properties: {
            date: {
              type: 'object',
              nullable: true,
              properties: {
                preset: {
                  type: 'string',
                  nullable: true,
                  enum: ['today', 'tomorrow', 'day_after_tomorrow', 'now'],
                  description: '常用时间范围，如 今天 / 明天 / 后天 / 现在'
                },
                start: {
                  type: 'string',
                  nullable: true,
                  format: 'date-time',
                  description: '自定义开始时间（ISO8601）'
                },
                end: {
                  type: 'string',
                  nullable: true,
                  format: 'date-time',
                  description: '自定义结束时间（ISO8601）'
                }
              }
            },
            done: {
              type: 'boolean',
              nullable: true,
              description: '是否筛选已完成任务（默认仅未完成）'
            },
            notified: {
              type: 'boolean',
              nullable: true,
              description: '是否筛选已经通知过的任务'
            },
            priorities: {
              type: 'array',
              nullable: true,
              description: '筛选优先级，可传多个，如 ["low", "normal"]',
              items: { type: 'string', enum: ['low', 'normal', 'high'] }
            }
          }
        }
      },
      required: ['intent']
    }
  }
};

export async function parseTask(rawInput: string): Promise<ParseResult> {
  const rel = parseRelative(rawInput);

  const tools: ChatCompletionTool[] = [parseTaskTool];
  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'parse_task' } };

const systemPrompt = `
You are an expert task scheduling and planning assistant. Your primary job is to analyze user requests and convert them into a structured task object.

1. **Determine the primary intent.** (For this process, assume 'add_task').

2. **Extract all possible information** including title, time, location, priority, and constraints.

3. **Automatically infer constraints** (mustBeIndoor/Outdoor, requiresFocus) based on the task title and context.

4. If the user doesn't actively provide relevant information, use common sense to estimate the estimatedDuration, category, tags, contextConstraints, and conditionConstraints as much as possible.

5. ContextConstraints: object with optional keys like { mustBeIndoor: bool, needsInternet: bool, noiseSensitive: bool }

6. ConditionConstraints: Describes the external conditions required for the task's execution.
    - Weather: Can include a type (such as "not_rainy", "clear") and a temperature range (minTemperature, maxTemperature).
    - Time (timeOfDay): Restricts the task to a specific time of day ("morning", "afternoon", "evening").
    - Location Status (locationStatus): Specifies the task location ("home", "office", "outdoor").
    - Other: Can also be expanded to include dayOfWeek, airQualityIndex, calendarFree, etc., and even support a customCondition described in natural language.
    - You may set multiple constraints at once
  For example, "go for a run" might require "not_rainy" weather.

7. A task is parallelizable if it doesn't require user's full attention or can be performed simultaneously with a primary task; this is true for tasks with Low Focus Requirement (e.g., listening to a podcast, music, or background reading), Low Physical or Cognitive Load (e.g., waiting or simple, repetitive work), and No Conflict with the Primary Task; Parallel Examples: listening to a podcast while doing dishes, replying to emails while waiting, or reading news while a program runs; Non-Parallel Examples: attending a meeting while writing code, watching TV while reading study material, or doing intricate manual work while on the phone; the determination is inferred based on the task's nature, the user's description, and general common sense.


8. parallelReason: Provide a brief explanation stating why the task can or cannot be run in parallel with other tasks.

9. priority: one of ['low', 'normal', 'high']; Default to 'normal' if not specified or inferrable.

10. priorityReason: Provide a brief explanation stating why the task was assigned its specific priority. For example, "high" priority for urgent deadlines or important meetings; "low" priority for leisure activities or non-urgent tasks.



6. **Identify missing critical information** (e.g., is '15:00' the start time or the departure time?). If critical information is missing, formulate 'clarificationQuestions'.

7. **Suggest relevant preparatory tasks** if applicable (e.g., travel/packing for a flight).

7. Provide a brief explanation for priorityReason and parallelReason, stating why the task was assigned its specific priority and why it can or cannot be run in parallel with other tasks.

8. If a field is not applicable or cannot be inferred, set it to 'null' or an empty object/array.


`;

  const res = await createChatCompletion('parseTask', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: systemPrompt.trim() },
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
  const start = parsed.startTime ? new Date(parsed.startTime) : applyRelativeOffset(parsed.relativeOffsetMinutes ?? undefined);

  return {
    userId,
    rawInput,
    intent: parsed.intent,
    title: parsed.title ?? '(未命名)',
    category: parsed.category ?? null,
    tags: parsed.tags ?? [],
    startTime: start ?? null,
    estimatedDuration: parsed.estimatedDuration ?? null,
    relativeOffsetMinutes: parsed.relativeOffsetMinutes ?? null,
    priority: parsed.priority ?? 'normal',
    priorityReason: parsed.priorityReason ?? null,
    parallelReason: parsed.parallelReason ?? null,
    contextConstraints: (parsed.contextConstraints ?? {}) as ContextConstraints,
    conditionConstraints: (parsed.conditionConstraints ?? {}) as ConditionConstraints,
    explanation: parsed.explanation ?? null,
    isFollowUpAnswer: parsed.isFollowUpAnswer ?? false
  };
}
