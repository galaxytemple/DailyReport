import { getThemes, getTopicKeywordsByTheme } from '@/lib/queries';
import { createTheme, updateThemeEmails, toggleTheme } from './actions';
import { DeleteThemeButton } from './DeleteThemeButton';

export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  const [themes, topicsByTheme] = await Promise.all([
    getThemes(),
    getTopicKeywordsByTheme(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Themes</h1>
        <p className="text-sm text-gray-500 mt-1">
          One theme = one daily email. Recipients listed below get that theme&apos;s report.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add theme</h2>
        <form action={createTheme} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3">
          <input
            name="name"
            placeholder="Theme name (e.g. AI engineering)"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            name="emails"
            placeholder="Recipient emails (CSV)"
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
      </section>

      <section className="space-y-3">
        {themes.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{t.name}</h3>
                  {t.active ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">paused</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <form action={toggleTheme.bind(null, t.id, t.active)}>
                  <button
                    type="submit"
                    className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    {t.active ? 'Pause' : 'Resume'}
                  </button>
                </form>
                <DeleteThemeButton
                  themeId={t.id}
                  themeName={t.name}
                  topicKeywords={topicsByTheme.get(t.id) ?? []}
                />
              </div>
            </div>
            <form action={updateThemeEmails.bind(null, t.id)} className="mt-4 flex gap-2">
              <input
                name="emails"
                defaultValue={t.emails}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="text-sm px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Save emails
              </button>
            </form>
          </div>
        ))}
        {themes.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
            No themes yet. Add one above to start receiving reports.
          </div>
        )}
      </section>
    </div>
  );
}
