import cron from 'node-cron';
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';
import { clusterTopics } from './cluster.js';
import type { TopicCluster } from './cluster.js';
import { retrieveContextForCluster } from './rag.js';
import { analyzeCluster } from './analyze.js';
import { saveReport, markSent } from './report.js';
import { sendReport } from './email.js';

async function loadActiveTopics(): Promise<Topic[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, number]>(
      `SELECT id, keyword, email, active FROM topics WHERE active = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, keyword, email, active]) => ({
      id, keyword, email, active, createdAt: new Date(),
    }));
  } finally {
    await conn.close();
  }
}

async function processCluster(
  cluster: TopicCluster,
  topicsById: Map<number, Topic>,
): Promise<void> {
  const topics = cluster.topicIds.map((id) => topicsById.get(id)).filter(Boolean) as Topic[];
  if (topics.length === 0) return;

  console.log(`[job] cluster "${cluster.theme}" — ${topics.length} topic(s): ${topics.map((t) => t.keyword).join(', ')}`);

  const passages = await retrieveContextForCluster(
    topics.map((t) => ({ topicId: t.id, keyword: t.keyword })),
  );

  if (passages.length === 0) {
    console.log(`[job] cluster "${cluster.theme}" — no passages, skipping`);
    return;
  }

  const content = await analyzeCluster({
    theme: cluster.theme,
    topics: topics.map((t) => ({ id: t.id, keyword: t.keyword })),
    passages,
  });

  const reportId = await saveReport(topics[0].id, cluster.theme, content);

  const recipients = Array.from(new Set(topics.map((t) => t.email)));
  await sendReport({ to: recipients, theme: cluster.theme, content });
  await markSent(reportId);

  console.log(`[job] cluster "${cluster.theme}" — sent to ${recipients.join(', ')} (report=${reportId})`);
}

async function runJob(): Promise<void> {
  const topics = await loadActiveTopics();
  if (topics.length === 0) {
    console.log('[job] no active topics, exiting');
    return;
  }

  console.log(`[job] starting — ${topics.length} active topic(s)`);
  const clusters = await clusterTopics(topics);
  console.log(`[job] clustered into ${clusters.length} group(s)`);

  const topicsById = new Map(topics.map((t) => [t.id, t]));
  for (const cluster of clusters) {
    try {
      await processCluster(cluster, topicsById);
    } catch (e) {
      console.error(`[job] cluster "${cluster.theme}" failed:`, e);
    }
  }
  console.log('[job] done');
}

async function main(): Promise<void> {
  await initPool();

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
