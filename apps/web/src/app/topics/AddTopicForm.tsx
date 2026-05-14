'use client';
import { useRef, useState, useTransition } from 'react';
import type { Theme } from '@daily/db';
import { createTopic } from './actions';

export function AddTopicForm({ themes }: { themes: Theme[] }) {
  const [themeId, setThemeId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const keywordRef = useRef<HTMLInputElement>(null);

  if (themes.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Create a <a href="/themes" className="text-blue-600 hover:underline">theme</a> first.
      </p>
    );
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createTopic(formData);
        // Keep themeId selected; only clear the keyword input so the next
        // topic under the same theme can be typed immediately.
        if (keywordRef.current) {
          keywordRef.current.value = '';
          keywordRef.current.focus();
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3">
      <select
        name="themeId"
        required
        value={themeId}
        onChange={(e) => setThemeId(e.target.value)}
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
        ref={keywordRef}
        name="keyword"
        placeholder="Keyword (e.g. oil price, gemma weights)"
        required
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Adding…' : 'Add'}
      </button>
      {error && (
        <p className="sm:col-span-3 text-xs text-red-600">{error}</p>
      )}
    </form>
  );
}
