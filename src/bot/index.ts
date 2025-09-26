// src/bot/index.ts
import { Bot } from 'grammy';
import { logger } from '../utils/logger';
import { registerBotHandlers } from './handlers';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is not set');
}

export const bot = new Bot(token);

registerBotHandlers(bot);

void bot.start();
logger.info('Bot started');
