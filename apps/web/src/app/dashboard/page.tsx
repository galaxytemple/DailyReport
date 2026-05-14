import { getTopics, getTodayCount } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [topics, counts] = await Promise.all([getTopics(), getTodayCount()]);

  return (
    <main>
      <h1>Dashboard — Today&apos;s Collection</h1>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>Refresh the page to update counts.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Topic</th>
            <th>Items today</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
              <td>{t.keyword}</td>
              <td style={{ textAlign: 'center' }}>{counts[t.id] ?? 0}</td>
              <td style={{ textAlign: 'center' }}>{t.active ? '🟢 active' : '⏸ paused'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
