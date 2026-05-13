// scripts/send-test-report.ts
//
// Minimal DB → email smoke. Counts rows in each table and emails the result.
// Verifies the DB connection and SMTP send path before the real apps/job exists.
//
// Usage:
//   pnpm mail:test
//
// .env requirements:
//   ORACLE_USER / ORACLE_PASSWORD / ORACLE_TNS_NAME / ORACLE_SCHEMA / ORACLE_WALLET_PASSWORD
//   ORACLE_SMTP_HOST (e.g. smtp.gmail.com), ORACLE_SMTP_PORT (587),
//   ORACLE_SMTP_USER (your Gmail), ORACLE_SMTP_PASS (16-char Gmail App Password),
//   SMTP_FROM (must equal ORACLE_SMTP_USER for Gmail)
//   TEST_EMAIL_TO (optional, defaults to SMTP_FROM — sends to yourself)

import nodemailer from 'nodemailer';
import { initPool, getConnection, oracledb } from '@daily/db';

process.env.ORACLE_WALLET_DIR = './wallet';

const TABLES = ['topics', 'raw_data', 'daily_reports', 'archived_summary'] as const;

async function fetchRowCounts(): Promise<Record<string, number>> {
  await initPool();
  const conn = await getConnection();
  const counts: Record<string, number> = {};
  try {
    for (const table of TABLES) {
      const r = await conn.execute<[number]>(
        `SELECT COUNT(*) FROM ${table}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_ARRAY },
      );
      counts[table] = r.rows?.[0]?.[0] ?? 0;
    }
  } finally {
    await conn.close();
  }
  return counts;
}

function buildBody(counts: Record<string, number>): string {
  const widest = Math.max(...TABLES.map((t) => t.length));
  const lines = [
    `Daily Report — DB ↔ SMTP smoke test`,
    ``,
    `Generated:  ${new Date().toISOString()}`,
    `DB user:    ${process.env.ORACLE_USER}`,
    `Schema:     ${process.env.ORACLE_SCHEMA}`,
    `TNS:        ${process.env.ORACLE_TNS_NAME}`,
    `Session TZ: ${process.env.ORACLE_TIMEZONE ?? '(unset, +09:00 fallback)'}`,
    ``,
    `Row counts:`,
    ...TABLES.map((t) => `  ${t.padEnd(widest)}  ${String(counts[t]).padStart(6)}`),
    ``,
    `Sent via ${process.env.ORACLE_SMTP_HOST}:${process.env.ORACLE_SMTP_PORT ?? 587}.`,
  ];
  return lines.join('\n');
}

async function main(): Promise<void> {
  const required = ['ORACLE_SMTP_HOST', 'ORACLE_SMTP_USER', 'ORACLE_SMTP_PASS', 'SMTP_FROM'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[mail-test] missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const counts = await fetchRowCounts();
  console.log('[mail-test] row counts:', counts);

  const transporter = nodemailer.createTransport({
    host: process.env.ORACLE_SMTP_HOST,
    port: Number(process.env.ORACLE_SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.ORACLE_SMTP_USER,
      pass: process.env.ORACLE_SMTP_PASS,
    },
  });

  const to = process.env.TEST_EMAIL_TO ?? process.env.SMTP_FROM!;
  const body = buildBody(counts);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`[mail-test] sending to ${to} via ${process.env.ORACLE_SMTP_HOST}`);
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM!,
    to,
    subject: `[Daily Report] DB+SMTP smoke ${today}`,
    text: body,
  });
  console.log(`[mail-test] sent: messageId=${info.messageId}`);
  if (info.response) console.log(`[mail-test] server response: ${info.response}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[mail-test] failed:', (e as Error).message);
  process.exit(1);
});
