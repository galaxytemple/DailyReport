import 'server-only';
import { auth } from '@/auth';

type SessionLike = { user?: { email?: string | null } | null } | null;

// Reads QUIZ_OWNER_EMAIL only on the server. Callers pass the already-resolved
// session so server components can gate rendering on the boolean result without
// the email ever reaching the client.
export function isQuizOwner(session: SessionLike): boolean {
  const owner = process.env.QUIZ_OWNER_EMAIL?.trim();
  return !!owner && session?.user?.email === owner;
}

// Guard for server actions (no notFound() outside the render path).
export async function assertQuizOwner(): Promise<void> {
  const session = await auth();
  if (!isQuizOwner(session)) throw new Error('Forbidden');
}
