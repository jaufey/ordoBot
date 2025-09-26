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
        title: { type: 'string', description: '任务标题，简短明确' },
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
        }
      },
      required: ['intent', 'title']
    }
  }
};

export async function parseTask(rawInput: string): Promise<ParseResult> {
  const rel = parseRelative(rawInput);

  const tools: ChatCompletionTool[] = [parseTaskTool];
  const toolChoice: ChatCompletionNamedToolChoice = { type: 'function', function: { name: 'parse_task' } };

  const res = await createChatCompletion('parseTask', {
    tools,
    tool_choice: toolChoice,
    messages: [
      { role: 'system', content: '你是任务解析器；按 schema 返回结构化字段。若时间为相对表达，可留空 startTime。' },
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
    contextConstraints: (parsed.contextConstraints ?? {}) as ContextConstraints,
    conditionConstraints: (parsed.conditionConstraints ?? {}) as ConditionConstraints,
    explanation: parsed.explanation ?? null,
    priorityReason: parsed.priorityReason ?? null,
    parallelReason: parsed.parallelReason ?? null,
    isFollowUpAnswer: parsed.isFollowUpAnswer ?? false
  };
}
