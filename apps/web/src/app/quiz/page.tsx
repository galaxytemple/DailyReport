import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isQuizOwner } from '@/lib/quiz-owner';
import { getMonthlyStats } from '@/lib/queries';
import { Calendar } from './Calendar';

export const dynamic = 'force-dynamic';

// Current month in America/Los_Angeles, matching how correct answers are
// bucketed by day. Intl handles PST/PDT, independent of the server's clock.
function currentYmLa(): string {
  // en-CA formats as YYYY-MM-DD; slice off the day.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
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
  const ym = ymParam && YM_RE.test(ymParam) ? ymParam : currentYmLa();
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
