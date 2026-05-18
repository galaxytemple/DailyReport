import { Agent, setGlobalDispatcher } from 'undici';
// CPU-only Ollama on this VM: prefill for a multi-thousand-token prompt can
// take many minutes before the first byte. Disable undici's headers/body
// timeouts (5min/5min by default) so long Ollama calls don't abort mid-prefill.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

import cron from 'node-cron';
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Theme, Topic } from '@daily/db';
import { retrieveContextForCluster } from './rag.js';
import { analyzeCluster } from './analyze.js';
import { saveReport, markSent } from './report.js';
import { sendReport } from './email.js';

interface ThemeWithTopics extends Theme {
  topics: Topic[];
}

async function loadActiveThemesWithTopics(): Promise<ThemeWithTopics[]> {
  const conn = await getConnection();
  try {
    const themesResult = await conn.execute<[number, string, string, number, Date]>(
      `SELECT id, name, emails, active, created_at
       FROM themes
       WHERE active = 1
       ORDER BY id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    const themes: ThemeWithTopics[] = (themesResult.rows ?? []).map(
      ([id, name, emails, active, createdAt]) => ({
        id, name, emails, active, createdAt, topics: [],
      }),
    );
    if (themes.length === 0) return [];

    const binds: Record<string, number> = {};
    themes.forEach((t, i) => { binds[`t${i}`] = t.id; });
    const placeholders = themes.map((_, i) => `:t${i}`).join(',');

    const topicsResult = await conn.execute<[number, number, string, number, Date]>(
      `SELECT id, theme_id, keyword, active, created_at
       FROM topics
       WHERE active = 1
         AND theme_id IN (${placeholders})`,
      binds,
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );

    const byThemeId = new Map(themes.map((t) => [t.id, t]));
    for (const [id, themeId, keyword, active, createdAt] of topicsResult.rows ?? []) {
      byThemeId.get(themeId)?.topics.push({ id, themeId, keyword, active, createdAt });
    }
    return themes.filter((t) => t.topics.length > 0);
  } finally {
    await conn.close();
  }
}

function splitEmails(csv: string): string[] {
  return csv.split(',').map((e) => e.trim()).filter(Boolean);
}

async function processTheme(theme: ThemeWithTopics): Promise<void> {
  console.log(
    `[job] theme "${theme.name}" — ${theme.topics.length} topic(s): ${theme.topics
      .map((t) => t.keyword)
      .join(', ')}`,
  );

  const passages = await retrieveContextForCluster(
    theme.topics.map((t) => ({ topicId: t.id, keyword: t.keyword })),
  );
  if (passages.length === 0) {
    console.log(`[job] theme "${theme.name}" — no passages, skipping`);
    return;
  }

  const content = await analyzeCluster({
    theme: theme.name,
    topics: theme.topics.map((t) => ({ id: t.id, keyword: t.keyword })),
    passages,
  });

  const reportId = await saveReport(theme.id, theme.name, content);

  const recipients = splitEmails(theme.emails);
  if (recipients.length === 0) {
    console.log(`[job] theme "${theme.name}" — no recipients; saved but not sent (report=${reportId})`);
    return;
  }

  await sendReport({ to: recipients, theme: theme.name, content });
  await markSent(reportId);
  console.log(`[job] theme "${theme.name}" — sent to ${recipients.join(', ')} (report=${reportId})`);
}

async function runJob(): Promise<void> {
  const themes = await loadActiveThemesWithTopics();
  if (themes.length === 0) {
    console.log('[job] no active themes with topics, exiting');
    return;
  }

  console.log(`[job] starting — ${themes.length} active theme(s)`);
  for (const theme of themes) {
    try {
      await processTheme(theme);
    } catch (e) {
      console.error(`[job] theme "${theme.name}" failed:`, e);
    }
  }
  console.log('[job] done');
}

async function main(): Promise<void> {
  await initPool();

  // --once: manual test run. Executes runJob immediately and exits.
  // Touches only themes/topics/raw_data/reports for read + reports for write;
  // does NOT trigger archivist (the only thing that deletes raw_data).
  if (process.argv.includes('--once')) {
    console.log('[job] manual run (--once) — raw_data is NOT purged');
    try {
      await runJob();
      process.exit(0);
    } catch (e) {
      console.error('[job] manual run failed:', e);
      process.exit(1);
    }
  }

  const schedule = process.env.JOB_CRON ?? '0 5 * * *';
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid JOB_CRON: "${schedule}"`);
  }

  cron.schedule(schedule, () => {
    runJob().catch((e) => console.error('[job] runJob failed:', e));
  });
  console.log(`[job] scheduled at "${schedule}"`);
}

main().catch((e) => {
  console.error('[job] fatal:', e);
  process.exit(1);
});
