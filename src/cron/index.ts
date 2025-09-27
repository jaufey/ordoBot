// src/cron/index.ts
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { notifyDueTasks } from '../core/notifier';
import { runConflictDetection } from '../core/conflictHandler';
import { runComboSuggest } from '../core/comboHandler';
import { runReplan } from '../core/replanHandler';

let started = false;
const scheduled: ScheduledTask[] = [];

export function startCronJobs() {
  if (started) return scheduled;
  started = true;

  scheduled.push(
    cron.schedule('*/1 * * * *', async () => {
      await notifyDueTasks().catch((err) => console.error('[cron] notifyDueTasks failed', err));
    })
  );

  scheduled.push(
    cron.schedule('*/5 * * * *', async () => {
      await runConflictDetection().catch((err) => console.error('[cron] runConflictDetection failed', err));
    })
  );

  scheduled.push(
    cron.schedule('*/15 * * * *', async () => {
      await runComboSuggest().catch((err) => console.error('[cron] runComboSuggest failed', err));
    })
  );

  scheduled.push(
    cron.schedule('*/10 * * * *', async () => {
      await runReplan().catch((err) => console.error('[cron] runReplan failed', err));
    })
  );

  console.log('Cron jobs started');
  return scheduled;
}

if (import.meta.main) {
  startCronJobs();
}
