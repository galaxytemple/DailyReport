'use server';
import { revalidatePath } from 'next/cache';
import { initPool, getConnection } from '@daily/db';

export async function createTopic(formData: FormData): Promise<void> {
  const keyword = String(formData.get('keyword') ?? '').trim();
  const themeIdRaw = String(formData.get('themeId') ?? '').trim();
  const themeId = Number(themeIdRaw);

  if (!keyword) throw new Error('Keyword required');
  if (keyword.length > 500) throw new Error('Keyword too long (max 500)');
  if (!Number.isInteger(themeId) || themeId <= 0) {
    throw new Error('Theme required');
  }

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO topics (theme_id, keyword) VALUES (:themeId, :keyword)`,
      { themeId, keyword },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/topics');
}

export async function toggleTopic(id: number, active: number): Promise<void> {
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE topics SET active = :active WHERE id = :id`,
      { active: active === 1 ? 0 : 1, id },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/topics');
}

export async function deleteTopic(id: number): Promise<void> {
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM topics WHERE id = :id`, { id }, { autoCommit: true });
  } finally {
    await conn.close();
  }
  revalidatePath('/topics');
}
