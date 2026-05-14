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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Past Reports</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <aside className="space-y-2">
          {reports.map((r) => {
            const isSelected = id && Number(id) === r.id;
            return (
              <a
                key={r.id}
                href={`/reports?id=${r.id}`}
                className={`block rounded-md border px-4 py-3 transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{r.theme ?? r.themeName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(r.createdAt).toLocaleDateString()}
                  {r.sentAt && <span className="text-green-600 ml-1.5">✓ sent</span>}
                </div>
              </a>
            );
          })}
          {reports.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
              No reports yet.
            </div>
          )}
          {(Number(page) > 1 || reports.length === 20) && (
            <div className="flex justify-between text-sm pt-2">
              {Number(page) > 1 ? (
                <a href={`/reports?page=${Number(page) - 1}`} className="text-blue-600 hover:underline">
                  ← prev
                </a>
              ) : <span />}
              {reports.length === 20 && (
                <a href={`/reports?page=${Number(page) + 1}`} className="text-blue-600 hover:underline">
                  next →
                </a>
              )}
            </div>
          )}
        </aside>

        <section className="bg-white border border-gray-200 rounded-lg p-6 min-h-[400px]">
          {selected ? (
            <>
              {selected.theme && <h2 className="text-lg font-semibold mb-4">{selected.theme}</h2>}
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-gray-800">
                {selected.content ?? '(content purged after 90 days)'}
              </pre>
            </>
          ) : (
            <p className="text-sm text-gray-500">Select a report on the left to view its content.</p>
          )}
        </section>
      </div>
    </div>
  );
}
