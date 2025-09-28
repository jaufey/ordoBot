import 'dotenv/config';
// src/bot/index.ts
import { Bot } from 'grammy';
import { logger } from '../utils/logger';
import { registerBotHandlers } from './handlers';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is not set');
}

export const bot = new Bot(token);

bot.catch((err) => {
  logger.error('Bot error', { error: err.error, updateType: err.ctx?.updateType });
});

registerBotHandlers(bot);

export async function startBot() {
  await bot.start();
  logger.info('Bot started');
}
