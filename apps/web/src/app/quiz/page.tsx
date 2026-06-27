import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isQuizOwner } from '@/lib/quiz-owner';
import { getMonthlyStats } from '@/lib/queries';
import { Calendar } from './Calendar';

export const dynamic = 'force-dynamic';

// Current month in KST (+09:00), independent of the server's wall clock.
function currentYmKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await auth();
  if (!isQuizOwner(session)) notFound();

  const { ym: ymParam } = await searchParams;
  const ym = ymParam && YM_RE.test(ymParam) ? ymParam : currentYmKst();
  const stats = await getMonthlyStats(ym);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">Quiz</h1>
        <p className="text-sm text-gray-500 mt-1">Correct answers per day. Keep the streak going.</p>
      </header>
      <Calendar ym={ym} stats={stats} />
      <a
        href="/quiz/play"
        className="block text-center rounded-md bg-blue-600 text-white text-base font-medium px-4 py-3 hover:bg-blue-700"
      >
        퀴즈 시작
      </a>
    </div>
  );
}
