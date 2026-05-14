import cron from 'node-cron';
import { initPool } from '@daily/db';
import { summariseYesterday } from './summarize.js';
import { purgeYesterdayRawData, nullOldReportContent } from './purge.js';

async function runArchivist(): Promise<void> {
  console.log('[archivist] starting daily archive run...');

  await summariseYesterday();
  console.log('[archivist] summaries written');

  const deleted = await purgeYesterdayRawData();
  console.log(`[archivist] purged ${deleted} raw_data rows`);

  await nullOldReportContent();
  console.log('[archivist] nulled old report content');
}

async function main(): Promise<void> {
  await initPool();
  cron.schedule('0 3 * * *', () => {
    runArchivist().catch(console.error);
  });
  console.log('[archivist] started — runs daily at 03:00');
}

main().catch(console.error);
