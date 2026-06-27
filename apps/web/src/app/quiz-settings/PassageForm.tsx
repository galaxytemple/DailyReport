'use client';
import { useState } from 'react';
import { splitSentences, MIN_SENTENCES } from '@/lib/quiz';

type Action = (formData: FormData) => void | Promise<void>;

export function PassageForm({
  action,
  initialTitle = '',
  initialBody = '',
  submitLabel,
}: {
  action: Action;
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
}) {
  const [body, setBody] = useState(initialBody);
  const sentences = splitSentences(body);
  const tooShort = sentences.length < MIN_SENTENCES;

  return (
    <form action={action} className="space-y-3">
      <input
        name="title"
        defaultValue={initialTitle}
        placeholder="Passage title"
        required
        maxLength={500}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Paste the passage. Sentences split on . ? ! followed by a space."
        required
        rows={8}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Sentence preview</span>
          <span className={`text-xs ${tooShort ? 'text-red-600' : 'text-green-700'}`}>
            {sentences.length} sentence(s){tooShort ? ` — need ≥ ${MIN_SENTENCES}` : ''}
          </span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 max-h-60 overflow-y-auto">
          {sentences.map((s, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className="break-words">{s}</li>
          ))}
        </ol>
        {sentences.length === 0 && <p className="text-sm text-gray-400">Nothing yet.</p>}
      </div>
      <button
        type="submit"
        disabled={tooShort}
        className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </form>
  );
}
