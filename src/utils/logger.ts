// src/utils/logger.ts
/* 简单日志封装，后续可替换为更完整的日志库 */
export const logger = {
  info: (message: string, ...args: unknown[]) => console.log('[INFO]', message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn('[WARN]', message, ...args),
  error: (message: string, ...args: unknown[]) => console.error('[ERROR]', message, ...args)
};
