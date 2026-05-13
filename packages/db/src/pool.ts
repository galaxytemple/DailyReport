import oracledb from 'oracledb';

let initialised = false;

export async function initPool(): Promise<void> {
  if (initialised) return;

  await oracledb.createPool({
    user: process.env.ORACLE_USER!,
    password: process.env.ORACLE_PASSWORD!,
    connectString: process.env.ORACLE_TNS_NAME!,
    configDir: process.env.ORACLE_WALLET_DIR!,
    walletLocation: process.env.ORACLE_WALLET_DIR,
    walletPassword: process.env.ORACLE_WALLET_PASSWORD,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
    // No sessionCallback: oracledb 6.10 Thin mode hangs indefinitely when
    // conn.execute() is invoked inside the callback. Per-session SQL runs in
    // getConnection() below instead — costs ~60ms per acquire, acceptable here.
  });

  initialised = true;
}

/**
 * Get a connection from the default pool with per-session settings applied
 * (CURRENT_SCHEMA, TIME_ZONE). See note in initPool() for why this is here
 * instead of in sessionCallback.
 */
export async function getConnection(): Promise<oracledb.Connection> {
  const conn = await oracledb.getConnection();
  if (process.env.ORACLE_SCHEMA) {
    await conn.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`,
    );
  }
  // Pin the session timezone so TRUNC(SYSTIMESTAMP) matches the operator's day,
  // not the DB's default UTC. Override via ORACLE_TIMEZONE.
  await conn.execute(
    `ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`,
  );
  return conn;
}

export { oracledb };
