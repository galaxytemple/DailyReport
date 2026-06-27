'use client';
import { useState, useTransition } from 'react';
import type { QuizQuestion } from '@/lib/quiz';
import { fetchNextQuiz, recordCorrect } from '../actions';

export function QuizClient({ initial }: { initial: QuizQuestion | null }) {
  const [question, setQuestion] = useState<QuizQuestion | null>(initial);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  if (!question) {
    return (
      <div className="max-w-md mx-auto text-center text-sm text-gray-500 py-16 border border-dashed border-gray-300 rounded-lg">
        등록된 지문이 없습니다. Quiz Setting에서 지문을 추가하세요.
      </div>
    );
  }

  const answer = question.choices[question.answerIndex];

  function onSelect(i: number) {
    if (selected !== null) return;
    setSelected(i);
    if (question && i === question.answerIndex) {
      startTransition(async () => {
        await recordCorrect();
      });
    }
  }

  function onNext() {
    startTransition(async () => {
      const next = await fetchNextQuiz();
      setQuestion(next);
      setRevealed(false);
      setSelected(null);
    });
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        {question.format === 'blank' ? (
          <div className="space-y-2 text-base leading-relaxed">
            {question.prev && <p className="text-gray-500">{question.prev}</p>}
            <p className="font-semibold text-gray-900">
              {revealed && selected !== null ? answer : '_______________'}
            </p>
            {question.next && <p className="text-gray-500">{question.next}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-400">Title</p>
            <p className="text-lg font-semibold text-gray-900">{question.passageTitle}</p>
            <p className="text-sm text-gray-500">What is the opening sentence?</p>
          </div>
        )}
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full rounded-md bg-blue-600 text-white text-base font-medium px-4 py-3 hover:bg-blue-700"
        >
          Answer
        </button>
      ) : (
        <div className="space-y-2">
          {question.choices.map((c, i) => {
            const isAnswer = i === question.answerIndex;
            const isPicked = i === selected;
            const decided = selected !== null;
            const cls = !decided
              ? 'border-gray-300 hover:bg-gray-50'
              : isAnswer
                ? 'border-green-400 bg-green-50'
                : isPicked
                  ? 'border-red-400 bg-red-50'
                  : 'border-gray-200 opacity-60';
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                disabled={decided}
                className={`w-full text-left rounded-md border px-4 py-3 text-sm ${cls}`}
              >
                {c}
                {decided && isAnswer && <span className="ml-2 text-green-700">✓</span>}
                {decided && isPicked && !isAnswer && <span className="ml-2 text-red-600">✗</span>}
              </button>
            );
          })}
        </div>
      )}

      {selected !== null && (
        <div className="space-y-3">
          <p className={`text-sm font-medium ${selected === question.answerIndex ? 'text-green-700' : 'text-red-600'}`}>
            {selected === question.answerIndex ? '정답입니다!' : '틀렸습니다.'}
          </p>
          <button
            onClick={onNext}
            disabled={pending}
            className="w-full rounded-md bg-gray-900 text-white text-base font-medium px-4 py-3 hover:bg-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
