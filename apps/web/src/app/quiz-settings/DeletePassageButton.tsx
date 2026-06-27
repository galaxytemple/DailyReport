'use client';
import { deletePassage } from './actions';

export function DeletePassageButton({ id, title }: { id: number; title: string }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete passage "${title}"?`)) e.preventDefault();
  }
  return (
    <form action={deletePassage.bind(null, id)} onSubmit={onSubmit}>
      <button
        type="submit"
        className="text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
