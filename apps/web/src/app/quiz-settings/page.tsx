import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isQuizOwner } from '@/lib/quiz-owner';
import { getPassages, getQuizConfig } from '@/lib/queries';
import { splitSentences } from '@/lib/quiz';
import { createPassage, updatePassage, updateQuizConfig } from './actions';
import { PassageForm } from './PassageForm';
import { DeletePassageButton } from './DeletePassageButton';

export const dynamic = 'force-dynamic';

export default async function QuizSettingsPage() {
  const session = await auth();
  if (!isQuizOwner(session)) notFound();

  const [passages, config] = await Promise.all([getPassages(), getQuizConfig()]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Quiz Setting</h1>
        <p className="text-sm text-gray-500 mt-1">
          Store passages and control how often each quiz format appears.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Format ratio</h2>
        <form action={updateQuizConfig} className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">
            Blank-sentence format:&nbsp;
            <input
              type="number"
              name="blankPct"
              min={0}
              max={100}
              step={1}
              defaultValue={config.blankPct}
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            &nbsp;%
          </label>
          <span className="text-sm text-gray-500">
            (first-sentence format: {100 - config.blankPct}%)
          </span>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Save ratio
          </button>
        </form>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add passage</h2>
        <PassageForm action={createPassage} submitLabel="Add passage" />
      </section>

      <section className="space-y-3">
        {passages.map((p) => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium break-words">{p.title}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {splitSentences(p.body).length} sentence(s) · created{' '}
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <DeletePassageButton id={p.id} title={p.title} />
            </div>
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer">Edit</summary>
              <div className="mt-3">
                <PassageForm
                  action={updatePassage.bind(null, p.id)}
                  initialTitle={p.title}
                  initialBody={p.body}
                  submitLabel="Save changes"
                />
              </div>
            </details>
          </div>
        ))}
        {passages.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
            No passages yet. Add one above.
          </div>
        )}
      </section>
    </div>
  );
}
