import { getTopicsWithTheme, getTodayCount, getGlobalRssTodayCount } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [topics, counts, globalRss] = await Promise.all([
    getTopicsWithTheme(),
    getTodayCount(),
    getGlobalRssTodayCount(),
  ]);

  const byTheme = new Map<string, typeof topics>();
  for (const t of topics) {
    const list = byTheme.get(t.themeName) ?? [];
    list.push(t);
    byTheme.set(t.themeName, list);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard — Today&apos;s Collection</h1>
        <p className="text-sm text-gray-500 mt-1">Refresh the page to update counts.</p>
      </header>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Global RSS pool</h2>
            <p className="text-xs text-gray-600 mt-1">
              Items from all 38 RSS feeds — not keyword-scoped. Job&apos;s RAG retrieves
              relevant ones per theme via embedding similarity.
            </p>
          </div>
          <span className="text-2xl font-mono text-blue-700">{globalRss}</span>
        </div>
      </section>

      <section className="space-y-5">
        {Array.from(byTheme.entries()).map(([themeName, list]) => {
          const total = list.reduce((sum, t) => sum + (counts[t.id] ?? 0), 0);
          return (
            <div key={themeName} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="font-medium">{themeName}</h3>
                <span className="text-sm text-gray-600">{total} keyword-scoped item(s) today</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {list.map((t) => (
                  <li key={t.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t.keyword}</span>
                      {t.active ? (
                        <span className="text-xs text-green-700">●</span>
                      ) : (
                        <span className="text-xs text-gray-400">○</span>
                      )}
                    </div>
                    <span className="text-sm font-mono text-gray-700">{counts[t.id] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {topics.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
            No topics yet.
          </div>
        )}
      </section>
    </div>
  );
}
