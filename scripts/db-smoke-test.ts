// scripts/db-smoke-test.ts
//
// Smoke test the runtime app user (ORACLE_USER from .env) can authenticate via
// wallet and SELECT from every table created by V1.
//
// Usage from repo root:
//   pnpm db:smoke              # connect as ORACLE_USER (app, DML-only)
//   pnpm db:smoke:schema       # connect as ORACLE_SCHEMA (DDL owner) — for diag
//
// Prereqs:
//   - .env populated
//   - wallet/ extracted into repo root
//   - V1 + V2 migrated
//   - DML grants applied to ORACLE_USER (for default smoke; not needed for --as-schema)

import { initPool, getConnection, oracledb } from '@daily/db';

// .env stores ORACLE_WALLET_DIR=/wallet (container path).
// On the host, the wallet lives at ./wallet — override before initPool() reads it.
process.env.ORACLE_WALLET_DIR = './wallet';

if (process.argv.includes('--as-schema')) {
  if (!process.env.ORACLE_SCHEMA || !process.env.ORACLE_SCHEMA_PASSWORD) {
    console.error('--as-schema requires ORACLE_SCHEMA and ORACLE_SCHEMA_PASSWORD in .env');
    process.exit(1);
  }
  process.env.ORACLE_USER = process.env.ORACLE_SCHEMA;
  process.env.ORACLE_PASSWORD = process.env.ORACLE_SCHEMA_PASSWORD;
  console.log('[smoke] override: connecting as schema owner (--as-schema)');
}

const TABLES = ['topics', 'raw_data', 'daily_reports', 'archived_summary'] as const;

async function main(): Promise<void> {
  console.log(
    `[smoke] connecting as ${process.env.ORACLE_USER} → ${process.env.ORACLE_TNS_NAME} ` +
      `(schema=${process.env.ORACLE_SCHEMA}, tz=${process.env.ORACLE_TIMEZONE})`,
  );

  await initPool();

  let failed = 0;
  for (const table of TABLES) {
    const conn = await getConnection();
    try {
      const result = await conn.execute<[number]>(
        `SELECT COUNT(*) FROM ${table}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_ARRAY },
      );
      const count = result.rows?.[0]?.[0] ?? 0;
      console.log(`  OK  ${table.padEnd(20)} ${String(count).padStart(5)} rows`);
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0];
      console.error(`  FAIL ${table.padEnd(20)} ${msg}`);
      failed += 1;
    } finally {
      await conn.close();
    }
  }

  if (failed > 0) {
    console.error(`\n[smoke] ${failed}/${TABLES.length} table(s) failed`);
    process.exit(1);
  }
  console.log(`\n[smoke] all ${TABLES.length} tables accessible`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke] unexpected error:', e);
  process.exit(1);
});
