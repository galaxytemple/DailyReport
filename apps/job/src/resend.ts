// Resend today's daily_reports rows that were saved but never sent
// (sent_at IS NULL). Used after an SMTP outage / config fix where the
// report content was generated but delivery failed. Re-renders via the
// current email.ts (markdown → HTML) so a fixed template applies even
// to backdated content.

import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

import { initPool, getConnection, oracledb } from '@daily/db';
import { sendReport } from './email.js';
import { markSent } from './report.js';

interface UnsentRow {
  id: number;
  themeId: number;
  themeName: string;
  emails: string;
  content: string;
}

async function loadUnsentToday(): Promise<UnsentRow[]> {
  const conn = await getConnection();
  try {
    const r = await conn.execute<[number, number, string, string, string]>(
      `SELECT r.id, r.theme_id, r.theme, t.emails, r.content
       FROM daily_reports r
       JOIN themes t ON t.id = r.theme_id
       WHERE r.sent_at IS NULL
         AND r.created_at >= SYSTIMESTAMP - INTERVAL '24' HOUR
       ORDER BY r.id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (r.rows ?? []).map(([id, themeId, themeName, emails, content]) => ({
      id,
      themeId,
      themeName,
      emails,
      content,
    }));
  } finally {
    await conn.close();
  }
}

function splitEmails(csv: string): string[] {
  return csv.split(',').map((e) => e.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  await initPool();
  const rows = await loadUnsentToday();
  if (rows.length === 0) {
    console.log('[resend] no unsent reports for today');
    process.exit(0);
  }
  console.log(`[resend] ${rows.length} unsent report(s) found`);
  for (const row of rows) {
    const recipients = splitEmails(row.emails);
    if (recipients.length === 0) {
      console.log(`[resend] report #${row.id} (${row.themeName}): no recipients, skipping`);
      continue;
    }
    try {
      await sendReport({ to: recipients, theme: row.themeName, content: row.content });
      await markSent(row.id);
      console.log(`[resend] report #${row.id} (${row.themeName}) → ${recipients.join(', ')}`);
    } catch (e) {
      console.error(`[resend] report #${row.id} (${row.themeName}) failed:`, (e as Error).message);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[resend] fatal:', e);
  process.exit(1);
});
