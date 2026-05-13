// Bisect the pool/sessionCallback hang. Run each scenario and see which fails.
// Run: pnpm tsx --env-file=.env scripts/db-probe.ts <scenario>
//   1 = standalone connection (already proven to work)
//   2 = pool, no sessionCallback, poolMin=0
//   3 = pool with sessionCallback (current packages/db behavior)
import oracledb from 'oracledb';

const baseCfg = {
  user: process.env.ORACLE_SCHEMA!,
  password: process.env.ORACLE_SCHEMA_PASSWORD!,
  connectString: process.env.ORACLE_TNS_NAME!,
  configDir: './wallet',
  walletLocation: './wallet',
  walletPassword: process.env.ORACLE_WALLET_PASSWORD!,
};

async function withTimer<T>(label: string, p: Promise<T>): Promise<T> {
  const t = Date.now();
  try {
    const r = await p;
    console.log(`[${label}] OK in ${Date.now() - t}ms`);
    return r;
  } catch (e) {
    console.error(`[${label}] FAIL in ${Date.now() - t}ms: ${(e as Error).message}`);
    throw e;
  }
}

async function scenario1(): Promise<void> {
  const conn = await withTimer('standalone-getConnection', oracledb.getConnection(baseCfg));
  const r = await conn.execute<[string]>(`SELECT user FROM dual`);
  console.log(`  SELECT user → ${r.rows?.[0]?.[0]}`);
  await conn.close();
}

async function scenario2(): Promise<void> {
  const pool = await withTimer(
    'pool-create (no callback, min=0)',
    oracledb.createPool({ ...baseCfg, poolMin: 0, poolMax: 5, poolIncrement: 1 }),
  );
  const conn = await withTimer('pool-getConnection', pool.getConnection());
  const r = await conn.execute<[string]>(`SELECT user FROM dual`);
  console.log(`  SELECT user → ${r.rows?.[0]?.[0]}`);
  await conn.close();
  await pool.close(0);
}

async function scenario3(): Promise<void> {
  const pool = await withTimer(
    'pool-create (with callback, min=1)',
    oracledb.createPool({
      ...baseCfg,
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1,
      sessionCallback: async (conn) => {
        await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`);
        await conn.execute(`ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`);
      },
    }),
  );
  const conn = await withTimer('pool-getConnection (triggers sessionCallback)', pool.getConnection());
  const r = await conn.execute<[string]>(`SELECT user FROM dual`);
  console.log(`  SELECT user → ${r.rows?.[0]?.[0]}`);
  await conn.close();
  await pool.close(0);
}

async function scenario4(): Promise<void> {
  // poolMin=1 alone (no callback). Tests if pre-warming itself hangs.
  const pool = await withTimer(
    'pool-create (no callback, min=1)',
    oracledb.createPool({ ...baseCfg, poolMin: 1, poolMax: 5, poolIncrement: 1 }),
  );
  const conn = await withTimer('pool-getConnection', pool.getConnection());
  await conn.close();
  await pool.close(0);
}

async function scenario5(): Promise<void> {
  // callback alone (poolMin=0). Tests if sessionCallback itself hangs.
  const pool = await withTimer(
    'pool-create (with callback, min=0)',
    oracledb.createPool({
      ...baseCfg,
      poolMin: 0,
      poolMax: 5,
      poolIncrement: 1,
      sessionCallback: async (conn) => {
        await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`);
        await conn.execute(`ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`);
      },
    }),
  );
  const conn = await withTimer('pool-getConnection (callback fires)', pool.getConnection());
  await conn.close();
  await pool.close(0);
}

async function scenario6(): Promise<void> {
  // callback with ONLY current_schema. If this hangs, schema is the issue.
  const pool = await withTimer(
    'pool-create (callback = SCHEMA only)',
    oracledb.createPool({
      ...baseCfg, poolMin: 0, poolMax: 5,
      sessionCallback: async (conn) => {
        await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`);
      },
    }),
  );
  const conn = await withTimer('pool-getConnection (SCHEMA only)', pool.getConnection());
  await conn.close();
  await pool.close(0);
}

async function scenario7(): Promise<void> {
  // callback with ONLY time_zone. If this hangs, TZ is the issue.
  const pool = await withTimer(
    'pool-create (callback = TZ only)',
    oracledb.createPool({
      ...baseCfg, poolMin: 0, poolMax: 5,
      sessionCallback: async (conn) => {
        await conn.execute(`ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`);
      },
    }),
  );
  const conn = await withTimer('pool-getConnection (TZ only)', pool.getConnection());
  await conn.close();
  await pool.close(0);
}

async function scenario8(): Promise<void> {
  // No sessionCallback at all. Run ALTER SESSION in a getConnection() wrapper.
  // Proves the wrapper pattern is viable as a replacement.
  const pool = await withTimer(
    'pool-create (no callback)',
    oracledb.createPool({ ...baseCfg, poolMin: 0, poolMax: 5 }),
  );
  const conn = await withTimer('pool-getConnection (no callback)', pool.getConnection());
  await withTimer(
    'wrapper: SCHEMA + TZ',
    (async () => {
      await conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`);
      await conn.execute(`ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`);
    })(),
  );
  const r = await conn.execute<[string]>(`SELECT user FROM dual`);
  console.log(`  SELECT user → ${r.rows?.[0]?.[0]}`);
  await conn.close();
  await pool.close(0);
}

const which = process.argv[2] ?? 'all';
const map = { '1': scenario1, '2': scenario2, '3': scenario3, '4': scenario4, '5': scenario5, '6': scenario6, '7': scenario7, '8': scenario8 } as const;

(async () => {
  if (which === 'all') {
    for (const k of ['6', '7'] as const) {
      console.log(`\n--- scenario ${k} ---`);
      try { await map[k](); } catch { /* logged */ }
    }
  } else if (which in map) {
    await map[which as keyof typeof map]();
  } else {
    console.error('usage: db-probe.ts <1|2|3|all>');
    process.exit(1);
  }
  process.exit(0);
})();
