import { getThemes, getTopicsWithTheme } from '@/lib/queries';
import { createTopic, toggleTopic, deleteTopic } from './actions';

export const dynamic = 'force-dynamic';

export default async function TopicsPage() {
  const [themes, topics] = await Promise.all([getThemes(), getTopicsWithTheme()]);

  const byTheme = new Map<number, typeof topics>();
  for (const t of topics) {
    const list = byTheme.get(t.themeId) ?? [];
    list.push(t);
    byTheme.set(t.themeId, list);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Topics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Topics belong to a theme. The crawler collects items for each keyword; the daily job
          groups them by theme into a single report.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add topic</h2>
        {themes.length === 0 ? (
          <p className="text-sm text-gray-500">
            Create a <a href="/themes" className="text-blue-600 hover:underline">theme</a> first.
          </p>
        ) : (
          <form action={createTopic} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3">
            <select
              name="themeId"
              required
              defaultValue=""
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Select theme…</option>
              {themes.map((th) => (
                <option key={th.id} value={th.id}>
                  {th.name}{th.active ? '' : ' (paused)'}
                </option>
              ))}
            </select>
            <input
              name="keyword"
              placeholder="Keyword (e.g. oil price, gemma weights)"
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
            >
              Add
            </button>
          </form>
        )}
      </section>

      <section className="space-y-5">
        {themes.map((th) => {
          const list = byTheme.get(th.id) ?? [];
          return (
            <div key={th.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{th.name}</h3>
                  {!th.active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">paused</span>
                  )}
                  <span className="text-xs text-gray-500">{list.length} topic(s)</span>
                </div>
              </div>
              {list.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-500">No topics under this theme.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {list.map((t) => (
                    <li key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{t.keyword}</span>
                        {t.active ? (
                          <span className="text-xs text-green-700">●</span>
                        ) : (
                          <span className="text-xs text-gray-400">○</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <form action={toggleTopic.bind(null, t.id, t.active)}>
                          <button
                            type="submit"
                            className="text-xs px-2.5 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            {t.active ? 'Pause' : 'Resume'}
                          </button>
                        </form>
                        <form action={deleteTopic.bind(null, t.id)}>
                          <button
                            type="submit"
                            className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {themes.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
            No themes yet. <a href="/themes" className="text-blue-600 hover:underline">Add a theme</a> first.
          </div>
        )}
      </section>
    </div>
  );
}
