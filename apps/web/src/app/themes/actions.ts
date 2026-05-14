'use server';
import { revalidatePath } from 'next/cache';
import { initPool, getConnection } from '@daily/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmailsCsv(raw: string): string {
  const list = raw.split(',').map((e) => e.trim()).filter(Boolean);
  if (list.length === 0) throw new Error('At least one email required');
  for (const e of list) {
    if (!EMAIL_RE.test(e)) throw new Error(`Invalid email: "${e}"`);
  }
  return list.join(',');
}

export async function createTheme(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const emailsRaw = String(formData.get('emails') ?? '').trim();

  if (!name) throw new Error('Name required');
  if (name.length > 200) throw new Error('Name too long (max 200)');
  const emails = validateEmailsCsv(emailsRaw);
  if (emails.length > 1000) throw new Error('Emails list too long (max 1000 chars)');

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO themes (name, emails) VALUES (:name, :emails)`,
      { name, emails },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/themes');
}

export async function updateThemeEmails(id: number, formData: FormData): Promise<void> {
  const emailsRaw = String(formData.get('emails') ?? '').trim();
  const emails = validateEmailsCsv(emailsRaw);

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE themes SET emails = :emails WHERE id = :id`,
      { emails, id },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/themes');
}

export async function toggleTheme(id: number, active: number): Promise<void> {
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE themes SET active = :active WHERE id = :id`,
      { active: active === 1 ? 0 : 1, id },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
  revalidatePath('/themes');
}

export async function deleteTheme(id: number): Promise<void> {
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(`DELETE FROM themes WHERE id = :id`, { id }, { autoCommit: true });
  } finally {
    await conn.close();
  }
  revalidatePath('/themes');
  revalidatePath('/topics');
}
