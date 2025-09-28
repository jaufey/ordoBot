import 'dotenv/config';
import { startBot } from './bot';
import { startCronJobs } from './cron';
import { logger } from './utils/logger';

async function bootstrap() {
  startCronJobs();
  await startBot();
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap application', err);
  process.exit(1);
});
