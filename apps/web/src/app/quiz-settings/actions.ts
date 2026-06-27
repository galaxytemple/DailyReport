'use server';
import { revalidatePath } from 'next/cache';
import { initPool, getConnection } from '@daily/db';
import { assertQuizOwner } from '@/lib/quiz-owner';
import { splitSentences, MIN_SENTENCES } from '@/lib/quiz';

function validatePassageInput(title: string, body: string): void {
  if (!title) throw new Error('Title required');
  if (title.length > 500) throw new Error('Title too long (max 500)');
  if (!body.trim()) throw new Error('Body required');
  const count = splitSentences(body).length;
  if (count < MIN_SENTENCES) {
    throw new Error(`Passage too short: ${count} sentence(s), need at least ${MIN_SENTENCES}`);
  }
}

export async function createPassage(formData: FormData): Promise<void> {
  await assertQuizOwner();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '');
  validatePassageInput(title, body);

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO quiz_passages (title, body) VALUES (:title, :body)`,
      { title, body },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/quiz-settings');
}

export async function updatePassage(id: number, formData: FormData): Promise<void> {
  await assertQuizOwner();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '');
  validatePassageInput(title, body);

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE quiz_passages SET title = :title, body = :body WHERE id = :id`,
      { title, body, id },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/quiz-settings');
}

export async function deletePassage(id: number): Promise<void> {
  await assertQuizOwner();
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM quiz_passages WHERE id = :id`, { id }, { autoCommit: true });
  } finally {
    await conn.close();
  }
  revalidatePath('/quiz-settings');
}

export async function updateQuizConfig(formData: FormData): Promise<void> {
  await assertQuizOwner();
  const raw = formData.get('blankPct');
  if (raw === null || String(raw).trim() === '') {
    throw new Error('Ratio is required');
  }
  const blankPct = Number(raw);
  if (!Number.isInteger(blankPct) || blankPct < 0 || blankPct > 100) {
    throw new Error('Ratio must be an integer between 0 and 100');
  }
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE quiz_config SET blank_pct = :blankPct WHERE id = 1`,
      { blankPct },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/quiz-settings');
}
