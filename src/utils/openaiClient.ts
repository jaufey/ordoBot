// src/utils/openaiClient.ts
import OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';

const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('AI_API_KEY (or OPENAI_API_KEY/GEMINI_API_KEY) must be set');
}

const baseURL = process.env.AI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? (process.env.GEMINI_API_KEY ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined);

export const aiClient = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {})
});

type AiTask = 'parseTask' | 'detectConflicts' | 'replanTasks' | 'suggestCombos';

const defaultModel = process.env.AI_MODEL_DEFAULT ?? 'gpt-4o-mini';
const modelMap: Record<AiTask, string> = {
  parseTask: process.env.AI_MODEL_PARSE_TASK ?? defaultModel,
  detectConflicts: process.env.AI_MODEL_DETECT_CONFLICTS ?? defaultModel,
  replanTasks: process.env.AI_MODEL_REPLAN ?? defaultModel,
  suggestCombos: process.env.AI_MODEL_SUGGEST_COMBOS ?? defaultModel
};

export type ChatOptions = Omit<ChatCompletionCreateParams, 'model'> & { model?: string };

export async function createChatCompletion(task: AiTask, params: ChatOptions) {
  const model = params.model ?? modelMap[task] ?? defaultModel;
  const { model: _ignored, ...rest } = params;
  return aiClient.chat.completions.create({ ...rest, model });
}
