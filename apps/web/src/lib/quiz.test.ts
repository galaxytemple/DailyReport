import { describe, it, expect } from 'vitest';
import {
  splitSentences,
  buildBlankQuiz,
  buildFirstSentenceQuiz,
  buildQuiz,
} from './quiz';

// Deterministic rng: replays a fixed sequence (0 <= v < 1).
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const FIVE = ['A1.', 'B2.', 'C3.', 'D4.', 'E5.'];

describe('splitSentences', () => {
  it('splits on . ? ! followed by whitespace, keeping punctuation', () => {
    expect(splitSentences('Hello world. How are you? I am fine!')).toEqual([
      'Hello world.',
      'How are you?',
      'I am fine!',
    ]);
  });

  it('splits across paragraph breaks and trims', () => {
    expect(splitSentences('One.\n\n  Two.\nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('keeps a trailing sentence without terminal punctuation', () => {
    expect(splitSentences('Done. Tail')).toEqual(['Done.', 'Tail']);
  });

  it('drops empty fragments', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('buildBlankQuiz', () => {
  it('uses prev/next neighbors and excludes them + answer from distractors', () => {
    // rng calls: [0] blankIndex pick -> index 0 (first sentence, prev=null)
    // then sampleTwo picks from pool, then shuffle.
    const q = buildBlankQuiz(FIVE, 'T', seq([0, 0, 0, 0, 0]));
    expect(q.format).toBe('blank');
    if (q.format !== 'blank') return;
    expect(q.passageTitle).toBe('T');
    expect(q.prev).toBeNull(); // blank is first sentence
    expect(q.next).toBe('B2.'); // immediate next
    expect(q.choices).toHaveLength(3);
    expect(q.choices[q.answerIndex]).toBe('A1.'); // answer is the blanked sentence
    // distractors must not be the answer, prev(none), or next('B2.')
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    expect(distractors).not.toContain('A1.');
    expect(distractors).not.toContain('B2.');
  });

  it('sets prev and next when blank is in the middle', () => {
    // blankIndex pick -> 2 (rng 0.5 * 5 = 2.5 -> floor 2)
    const q = buildBlankQuiz(FIVE, 'T', seq([0.5, 0, 0, 0, 0]));
    if (q.format !== 'blank') throw new Error('expected blank');
    expect(q.prev).toBe('B2.');
    expect(q.next).toBe('D4.');
    expect(q.choices[q.answerIndex]).toBe('C3.');
  });
});

describe('buildFirstSentenceQuiz', () => {
  it('answer is the first sentence; distractors come from the rest', () => {
    const q = buildFirstSentenceQuiz(FIVE, 'Title', seq([0, 0, 0, 0]));
    expect(q.format).toBe('firstSentence');
    if (q.format !== 'firstSentence') return;
    expect(q.passageTitle).toBe('Title');
    expect(q.choices).toHaveLength(3);
    expect(q.choices[q.answerIndex]).toBe('A1.');
    const distractors = q.choices.filter((_, i) => i !== q.answerIndex);
    expect(distractors).not.toContain('A1.');
  });
});

describe('buildQuiz', () => {
  it('picks blank format when rng*100 < blankPct', () => {
    const q = buildQuiz(FIVE, 'T', 50, seq([0, 0, 0, 0, 0])); // 0*100=0 < 50
    expect(q.format).toBe('blank');
  });

  it('picks firstSentence when blankPct is 0', () => {
    const q = buildQuiz(FIVE, 'T', 0, seq([0, 0, 0, 0])); // 0 < 0 is false
    expect(q.format).toBe('firstSentence');
  });

  it('picks blank when blankPct is 100', () => {
    const q = buildQuiz(FIVE, 'T', 100, seq([0.999, 0, 0, 0, 0])); // 99.9 < 100
    expect(q.format).toBe('blank');
  });
});
