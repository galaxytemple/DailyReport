'use client';
import { deleteTheme } from './actions';

export function DeleteThemeButton({
  themeId,
  themeName,
  topicKeywords,
}: {
  themeId: number;
  themeName: string;
  topicKeywords: string[];
}) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const topicLine = topicKeywords.length
      ? `\n\nThe following ${topicKeywords.length} topic(s) and ALL their crawled data will also be deleted:\n  • ${topicKeywords.join('\n  • ')}`
      : '\n\nThis theme has no topics.';
    if (!window.confirm(`Delete theme "${themeName}"?${topicLine}`)) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteTheme.bind(null, themeId)} onSubmit={onSubmit}>
      <button
        type="submit"
        className="text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
