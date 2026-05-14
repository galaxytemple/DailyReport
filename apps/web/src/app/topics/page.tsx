import { getTopics } from '@/lib/queries';
import { createTopic, toggleTopic, deleteTopic } from './actions';

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <main>
      <h1>Topics</h1>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        Daily reports are clustered by theme and emailed at <code>JOB_CRON</code> (default 05:00).
      </p>

      <form action={createTopic} style={{ marginBottom: '2rem', display: 'grid', gap: '0.5rem', maxWidth: 480 }}>
        <input name="keyword" placeholder="Keyword (e.g. oil price)" required />
        <input name="email" type="email" placeholder="Report email" required />
        <button type="submit">Add Topic</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Keyword</th>
            <th style={{ textAlign: 'left' }}>Email</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
              <td>{t.keyword}</td>
              <td>{t.email}</td>
              <td style={{ textAlign: 'center' }}>{t.active ? '✓' : '—'}</td>
              <td style={{ textAlign: 'center' }}>
                <form action={toggleTopic.bind(null, t.id, t.active)} style={{ display: 'inline' }}>
                  <button type="submit">{t.active ? 'Pause' : 'Resume'}</button>
                </form>
                {' '}
                <form action={deleteTopic.bind(null, t.id)} style={{ display: 'inline' }}>
                  <button type="submit">Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
