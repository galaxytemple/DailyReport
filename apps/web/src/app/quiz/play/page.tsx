import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isQuizOwner } from '@/lib/quiz-owner';
import { fetchNextQuiz } from '../actions';
import { QuizClient } from './QuizClient';

export const dynamic = 'force-dynamic';

export default async function QuizPlayPage() {
  const session = await auth();
  if (!isQuizOwner(session)) notFound();

  const initial = await fetchNextQuiz();
  return (
    <div className="space-y-4">
      <a href="/quiz" className="text-sm text-blue-600">← Back to calendar</a>
      <QuizClient initial={initial} />
    </div>
  );
}
