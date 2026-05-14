import { getReports, getReportContent } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string }>;
}) {
  const { page = '1', id } = await searchParams;
  const reports = await getReports(Number(page));
  const selected = id ? await getReportContent(Number(id)) : null;

  return (
    <main>
      <h1>Past Reports</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem' }}>
        <div>
          {reports.map((r) => (
            <div key={r.id} style={{ marginBottom: '0.75rem', padding: '0.5rem', border: '1px solid #eee', borderRadius: 4 }}>
              <a href={`/reports?id=${r.id}`} style={{ textDecoration: 'none', color: '#000' }}>
                <div style={{ fontWeight: 600 }}>{r.theme ?? r.keyword}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                  {r.keyword} · {new Date(r.createdAt).toLocaleDateString()}
                  {r.sentAt && ' · ✓ sent'}
                </div>
              </a>
            </div>
          ))}
          <div style={{ marginTop: '1rem' }}>
            {Number(page) > 1 && <a href={`/reports?page=${Number(page) - 1}`}>← prev</a>}
            {' '}
            {reports.length === 20 && <a href={`/reports?page=${Number(page) + 1}`}>next →</a>}
          </div>
        </div>
        <div>
          {selected ? (
            <>
              {selected.theme && <h2 style={{ marginTop: 0 }}>{selected.theme}</h2>}
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '1rem', borderRadius: 4 }}>
                {selected.content ?? '(content purged after 90 days)'}
              </pre>
            </>
          ) : (
            <p style={{ color: '#666' }}>Select a report to view its content.</p>
          )}
        </div>
      </div>
    </main>
  );
}
