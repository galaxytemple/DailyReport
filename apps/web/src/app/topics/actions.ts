'use server';
import { revalidatePath } from 'next/cache';
import { initPool, getConnection } from '@daily/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createTopic(formData: FormData): Promise<void> {
  const keyword = String(formData.get('keyword') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!keyword || !email) throw new Error('All fields required');
  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: "${email}"`);
  if (keyword.length > 500) throw new Error('Keyword too long (max 500)');

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO topics (keyword, email) VALUES (:keyword, :email)`,
      { keyword, email },
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
