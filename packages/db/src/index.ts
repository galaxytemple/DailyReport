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

export async function getConnection(): Promise<oracledb.Connection> {
  const conn = await oracledb.getConnection();
  if (process.env.ORACLE_SCHEMA) {
    await conn.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`,
    );
  }
  // Pin session timezone so TRUNC(SYSTIMESTAMP) matches the operator's day,
  // not the DB's default UTC.
  await conn.execute(
    `ALTER SESSION SET TIME_ZONE = '${process.env.ORACLE_TIMEZONE ?? '+09:00'}'`,
  );
  return conn;
}

export { oracledb };

export interface Topic {
  id: number;
  keyword: string;
  email: string;
  active: number;
  createdAt: Date;
}

export interface RawData {
  id: number;
  topicId: number;
  source: 'reddit' | 'twitter' | 'news';
  url: string | null;
  title: string | null;
  body: string | null;
  sentiment: number | null;
  createdAt: Date;
}

export interface DailyReport {
  id: number;
  topicId: number;
  theme: string | null;
  content: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface ArchivedSummary {
  id: number;
  topicId: number;
  reportDate: Date;
  rank: number;
  source: string;
  url: string | null;
  title: string | null;
  summary: string;
  sentiment: number | null;
  createdAt: Date;
}
