# Quiz Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only English-passage quiz feature (passage CRUD, two quiz formats, motivational calendar) to the daily-report web app.

**Architecture:** Next.js 16 App Router. Owner gating is server-only (`QUIZ_OWNER_EMAIL` never reaches the client). Three new Oracle tables. Pure, RNG-injected quiz logic in `lib/quiz.ts` (TDD with vitest). Server actions drive CRUD, quiz fetching, and correct-answer recording. The quiz player is a small client state machine; everything else is server components.

**Tech Stack:** Next.js 16, React 19, next-auth v5, Tailwind v4, oracledb (via `@daily/db`), vitest, Flyway.

## Global Constraints

- All code comments, docs, markdown MUST be English.
- Immutable updates only (spread, no mutation).
- `QUIZ_OWNER_EMAIL` is read ONLY in server code; never `NEXT_PUBLIC_`, never passed to a client component. Only a boolean derived from it may cross to the client.
- Owner check enforced at BOTH the nav (menu visibility) and every quiz page/action (direct-URL defense). Pages → `notFound()`; actions → throw.
- A passage must split into **≥ 5 sentences** to be valid (enforced on save, re-checked at quiz time).
- Sentence split rule: split on `.?!` followed by whitespace, keep punctuation with the sentence, trim, drop empties.
- Quiz repeats infinitely; only correct answers are recorded (per day).
- Mobile-first responsive (Tailwind, single column, large tap targets).
- DB session timezone is +09:00 (existing `getConnection`); "today" = `TRUNC(SYSTIMESTAMP)`.
- Migration applied MANUALLY via Flyway after push (`pnpm db:migrate`).

---

## File Structure

- Create: `db/migrations/V7__quiz.sql` — three tables + seed config row.
- Modify: `packages/db/src/index.ts` — add `Passage` interface.
- Create: `apps/web/vitest.config.ts` — vitest node config.
- Modify: `apps/web/package.json` — add `vitest` devDep + `test` script.
- Create: `apps/web/src/lib/quiz.ts` — pure quiz logic + `QuizQuestion` type.
- Create: `apps/web/src/lib/quiz.test.ts` — unit tests.
- Create: `apps/web/src/lib/quiz-owner.ts` — server-only `isQuizOwner` / `assertQuizOwner`.
- Modify: `apps/web/src/lib/queries.ts` — `getPassages`, `getQuizConfig`, `getMonthlyStats`.
- Create: `apps/web/src/app/quiz-settings/actions.ts` — passage CRUD + config.
- Create: `apps/web/src/app/quiz-settings/PassageForm.tsx` — client form + live preview.
- Create: `apps/web/src/app/quiz-settings/DeletePassageButton.tsx` — client confirm.
- Create: `apps/web/src/app/quiz-settings/page.tsx` — settings page.
- Create: `apps/web/src/app/quiz/actions.ts` — `fetchNextQuiz`, `recordCorrect`.
- Create: `apps/web/src/app/quiz/Calendar.tsx` — server-rendered month grid (helper for page).
- Create: `apps/web/src/app/quiz/page.tsx` — landing (calendar + start button).
- Create: `apps/web/src/app/quiz/play/QuizClient.tsx` — player state machine.
- Create: `apps/web/src/app/quiz/play/page.tsx` — player shell.
- Modify: `apps/web/src/app/layout.tsx` — conditional nav links.
- Modify: `.github/workflows/deploy.yml` — wire `QUIZ_OWNER_EMAIL`.

---

## Task 1: DB migration — quiz tables

**Files:**
- Create: `db/migrations/V7__quiz.sql`

**Interfaces:**
- Produces: tables `quiz_passages(id, title, body, created_at)`, `quiz_daily(day, correct_count)`, `quiz_config(id, blank_pct)` with one seeded row `(1, 50)`.

- [ ] **Step 1: Write the migration**

```sql
-- V7: owner-only English-passage quiz. Three tables:
--   quiz_passages  one stored passage (title + body CLOB)
--   quiz_daily     per-day count of CORRECT answers (motivation calendar)
--   quiz_config    single-row format ratio (blank_pct % of questions use the
--                  blank-sentence format; the rest use the first-sentence format)

CREATE TABLE quiz_passages (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      VARCHAR2(500) NOT NULL,
  body       CLOB          NOT NULL,
  created_at TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE quiz_daily (
  day           DATE   PRIMARY KEY,
  correct_count NUMBER NOT NULL
);

CREATE TABLE quiz_config (
  id        NUMBER PRIMARY KEY CHECK (id = 1),
  blank_pct NUMBER NOT NULL CHECK (blank_pct BETWEEN 0 AND 100)
);

INSERT INTO quiz_config (id, blank_pct) VALUES (1, 50);
```

- [ ] **Step 2: Sanity-check SQL syntax locally (no DB apply yet)**

Run: `grep -c "CREATE TABLE" db/migrations/V7__quiz.sql`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/V7__quiz.sql
git commit -m "feat(db): V7 quiz tables (passages, daily, config)"
```

> Note: actual `pnpm db:migrate` runs manually after the feature branch is deployed (per runbook). Do NOT apply in CI.

---

## Task 2: `Passage` interface in `@daily/db`

**Files:**
- Modify: `packages/db/src/index.ts` (append near other interfaces, after `ArchivedSummary`)

**Interfaces:**
- Produces: `export interface Passage { id: number; title: string; body: string; createdAt: Date }`

- [ ] **Step 1: Add the interface**

Append to `packages/db/src/index.ts`:

```ts
export interface Passage {
  id: number;
  title: string;
  body: string;
  createdAt: Date;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @daily/db typecheck 2>/dev/null || pnpm --filter @daily/web typecheck`
Expected: no errors related to `Passage`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(db): add Passage interface"
```

---

## Task 3: Pure quiz logic (TDD)

**Files:**
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/quiz.ts`
- Test: `apps/web/src/lib/quiz.test.ts`

**Interfaces:**
- Produces:
  - `type QuizQuestion = { format: 'blank'; passageTitle: string; prev: string | null; next: string | null; choices: string[]; answerIndex: number } | { format: 'firstSentence'; passageTitle: string; choices: string[]; answerIndex: number }`
  - `splitSentences(text: string): string[]`
  - `buildBlankQuiz(sentences: string[], title: string, rng: () => number): QuizQuestion`
  - `buildFirstSentenceQuiz(sentences: string[], title: string, rng: () => number): QuizQuestion`
  - `buildQuiz(sentences: string[], title: string, blankPct: number, rng: () => number): QuizQuestion`
  - `MIN_SENTENCES = 5`

- [ ] **Step 1: Add vitest config + script**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

In `apps/web/package.json`, add `"test": "vitest run"` to `scripts` and `"vitest": "^2.0.0"` to `devDependencies`. Then:

Run: `pnpm install`
Expected: vitest resolved for `@daily/web`.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/lib/quiz.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @daily/web test`
Expected: FAIL — `quiz.ts` has no exports / module not found.

- [ ] **Step 4: Implement `quiz.ts`**

Create `apps/web/src/lib/quiz.ts`:

```ts
// Pure quiz logic. No I/O, no secrets. RNG is injected so tests are
// deterministic. Shared by the client (live preview) and server (quiz build).

export const MIN_SENTENCES = 5;

export type QuizQuestion =
  | {
      format: 'blank';
      passageTitle: string;
      prev: string | null;
      next: string | null;
      choices: string[];
      answerIndex: number;
    }
  | {
      format: 'firstSentence';
      passageTitle: string;
      choices: string[];
      answerIndex: number;
    };

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length);
}

function sampleTwo(pool: string[], rng: () => number): string[] {
  const copy = [...pool];
  const out: string[] = [];
  for (let k = 0; k < 2 && copy.length > 0; k++) {
    const i = pickIndex(rng, copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function assembleChoices(
  answer: string,
  distractors: string[],
  rng: () => number,
): { choices: string[]; answerIndex: number } {
  const tagged = [
    { text: answer, isAnswer: true },
    ...distractors.map((text) => ({ text, isAnswer: false })),
  ];
  for (let i = tagged.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return {
    choices: tagged.map((t) => t.text),
    answerIndex: tagged.findIndex((t) => t.isAnswer),
  };
}

export function buildBlankQuiz(
  sentences: string[],
  title: string,
  rng: () => number,
): QuizQuestion {
  const blankIndex = pickIndex(rng, sentences.length);
  const prev = blankIndex > 0 ? sentences[blankIndex - 1] : null;
  const next = blankIndex < sentences.length - 1 ? sentences[blankIndex + 1] : null;
  const excluded = new Set([blankIndex - 1, blankIndex, blankIndex + 1]);
  const pool = sentences.filter((_, i) => !excluded.has(i));
  const { choices, answerIndex } = assembleChoices(
    sentences[blankIndex],
    sampleTwo(pool, rng),
    rng,
  );
  return { format: 'blank', passageTitle: title, prev, next, choices, answerIndex };
}

export function buildFirstSentenceQuiz(
  sentences: string[],
  title: string,
  rng: () => number,
): QuizQuestion {
  const { choices, answerIndex } = assembleChoices(
    sentences[0],
    sampleTwo(sentences.slice(1), rng),
    rng,
  );
  return { format: 'firstSentence', passageTitle: title, choices, answerIndex };
}

export function buildQuiz(
  sentences: string[],
  title: string,
  blankPct: number,
  rng: () => number,
): QuizQuestion {
  return rng() * 100 < blankPct
    ? buildBlankQuiz(sentences, title, rng)
    : buildFirstSentenceQuiz(sentences, title, rng);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @daily/web test`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json apps/web/src/lib/quiz.ts apps/web/src/lib/quiz.test.ts pnpm-lock.yaml
git commit -m "feat(web): pure quiz logic + vitest (split, blank, firstSentence, ratio)"
```

---

## Task 4: Server-only owner gating

**Files:**
- Create: `apps/web/src/lib/quiz-owner.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth`.
- Produces:
  - `isQuizOwner(session: { user?: { email?: string | null } | null } | null): boolean`
  - `assertQuizOwner(): Promise<void>` — throws `Error('Forbidden')` if not owner.

- [ ] **Step 1: Implement gating module**

Create `apps/web/src/lib/quiz-owner.ts`:

```ts
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
```

- [ ] **Step 2: Verify `server-only` is installed**

Run: `pnpm --filter @daily/web ls server-only 2>/dev/null || echo MISSING`
Expected: a version is printed. If `MISSING`, run `pnpm --filter @daily/web add server-only` (it ships with Next.js but pin it explicitly).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @daily/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/quiz-owner.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): server-only quiz owner gating"
```

---

## Task 5: Queries

**Files:**
- Modify: `apps/web/src/lib/queries.ts` (append)

**Interfaces:**
- Consumes: `Passage` from `@daily/db`.
- Produces:
  - `getPassages(): Promise<Passage[]>`
  - `getQuizConfig(): Promise<{ blankPct: number }>`
  - `getMonthlyStats(ym: string): Promise<Map<number, number>>` — `ym` is `'YYYY-MM'`; map key = day-of-month (1–31), value = correct count.

- [ ] **Step 1: Add imports**

In `apps/web/src/lib/queries.ts`, extend the existing type import:

```ts
import type { Theme, Topic, Passage } from '@daily/db';
```

- [ ] **Step 2: Append query functions**

```ts
export async function getPassages(): Promise<Passage[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, Date]>(
      `SELECT id, title, body, created_at FROM quiz_passages ORDER BY id DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, title, body, createdAt]) => ({
      id, title, body, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getQuizConfig(): Promise<{ blankPct: number }> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number]>(
      `SELECT blank_pct FROM quiz_config WHERE id = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return { blankPct: result.rows?.[0]?.[0] ?? 50 };
  } finally {
    await conn.close();
  }
}

export async function getMonthlyStats(ym: string): Promise<Map<number, number>> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, number]>(
      `SELECT TO_NUMBER(TO_CHAR(day, 'DD')) AS d, correct_count
       FROM quiz_daily
       WHERE day >= TO_DATE(:ym || '-01', 'YYYY-MM-DD')
         AND day <  ADD_MONTHS(TO_DATE(:ym || '-01', 'YYYY-MM-DD'), 1)`,
      { ym },
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    const out = new Map<number, number>();
    for (const [d, count] of result.rows ?? []) out.set(d, count);
    return out;
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @daily/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/queries.ts
git commit -m "feat(web): quiz queries (passages, config, monthly stats)"
```

---

## Task 6: Quiz Setting server actions

**Files:**
- Create: `apps/web/src/app/quiz-settings/actions.ts`

**Interfaces:**
- Consumes: `assertQuizOwner` from `@/lib/quiz-owner`; `splitSentences`, `MIN_SENTENCES` from `@/lib/quiz`.
- Produces server actions:
  - `createPassage(formData: FormData): Promise<void>`
  - `updatePassage(id: number, formData: FormData): Promise<void>`
  - `deletePassage(id: number): Promise<void>`
  - `updateQuizConfig(formData: FormData): Promise<void>`

- [ ] **Step 1: Implement actions**

Create `apps/web/src/app/quiz-settings/actions.ts`:

```ts
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
  const blankPct = Number(formData.get('blankPct'));
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @daily/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quiz-settings/actions.ts
git commit -m "feat(web): quiz-settings actions (passage CRUD + ratio)"
```

---

## Task 7: Quiz Setting UI

**Files:**
- Create: `apps/web/src/app/quiz-settings/DeletePassageButton.tsx`
- Create: `apps/web/src/app/quiz-settings/PassageForm.tsx`
- Create: `apps/web/src/app/quiz-settings/page.tsx`

**Interfaces:**
- Consumes: actions from `./actions`; `getPassages`, `getQuizConfig` from `@/lib/queries`; `splitSentences`, `MIN_SENTENCES` from `@/lib/quiz`; `auth` + `isQuizOwner`.
- Produces: route `/quiz-settings`.

- [ ] **Step 1: Delete button (client)**

Create `apps/web/src/app/quiz-settings/DeletePassageButton.tsx`:

```tsx
'use client';
import { deletePassage } from './actions';

export function DeletePassageButton({ id, title }: { id: number; title: string }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete passage "${title}"?`)) e.preventDefault();
  }
  return (
    <form action={deletePassage.bind(null, id)} onSubmit={onSubmit}>
      <button
        type="submit"
        className="text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
      >
        Delete
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Passage form with live preview (client)**

Create `apps/web/src/app/quiz-settings/PassageForm.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { splitSentences, MIN_SENTENCES } from '@/lib/quiz';

type Action = (formData: FormData) => void | Promise<void>;

export function PassageForm({
  action,
  initialTitle = '',
  initialBody = '',
  submitLabel,
}: {
  action: Action;
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
}) {
  const [body, setBody] = useState(initialBody);
  const sentences = splitSentences(body);
  const tooShort = sentences.length < MIN_SENTENCES;

  return (
    <form action={action} className="space-y-3">
      <input
        name="title"
        defaultValue={initialTitle}
        placeholder="Passage title"
        required
        maxLength={500}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Paste the passage. Sentences split on . ? ! followed by a space."
        required
        rows={8}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Sentence preview</span>
          <span className={`text-xs ${tooShort ? 'text-red-600' : 'text-green-700'}`}>
            {sentences.length} sentence(s){tooShort ? ` — need ≥ ${MIN_SENTENCES}` : ''}
          </span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 max-h-60 overflow-y-auto">
          {sentences.map((s, i) => (
            <li key={i} className="break-words">{s}</li>
          ))}
          {sentences.length === 0 && <li className="list-none text-gray-400">Nothing yet.</li>}
        </ol>
      </div>
      <button
        type="submit"
        disabled={tooShort}
        className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Settings page (server)**

Create `apps/web/src/app/quiz-settings/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { isQuizOwner } from '@/lib/quiz-owner';
import { getPassages, getQuizConfig } from '@/lib/queries';
import { splitSentences } from '@/lib/quiz';
import { createPassage, updatePassage, updateQuizConfig } from './actions';
import { PassageForm } from './PassageForm';
import { DeletePassageButton } from './DeletePassageButton';

export const dynamic = 'force-dynamic';

export default async function QuizSettingsPage() {
  const session = await auth();
  if (!isQuizOwner(session)) notFound();

  const [passages, config] = await Promise.all([getPassages(), getQuizConfig()]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Quiz Setting</h1>
        <p className="text-sm text-gray-500 mt-1">
          Store passages and control how often each quiz format appears.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Format ratio</h2>
        <form action={updateQuizConfig} className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">
            Blank-sentence format:&nbsp;
            <input
              type="number"
              name="blankPct"
              min={0}
              max={100}
              defaultValue={config.blankPct}
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            &nbsp;%
          </label>
          <span className="text-sm text-gray-500">
            (first-sentence format: {100 - config.blankPct}%)
          </span>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Save ratio
          </button>
        </form>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Add passage</h2>
        <PassageForm action={createPassage} submitLabel="Add passage" />
      </section>

      <section className="space-y-3">
        {passages.map((p) => (
          <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium break-words">{p.title}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {splitSentences(p.body).length} sentence(s) · created{' '}
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
              <DeletePassageButton id={p.id} title={p.title} />
            </div>
            <details>
              <summary className="text-sm text-blue-600 cursor-pointer">Edit</summary>
              <div className="mt-3">
                <PassageForm
                  action={updatePassage.bind(null, p.id)}
                  initialTitle={p.title}
                  initialBody={p.body}
                  submitLabel="Save changes"
                />
              </div>
            </details>
          </div>
        ))}
        {passages.length === 0 && (
          <div className="text-center text-sm text-gray-500 py-12 border border-dashed border-gray-300 rounded-lg">
            No passages yet. Add one above.
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @daily/web typecheck && pnpm --filter @daily/web lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quiz-settings
git commit -m "feat(web): quiz-settings page (passage CRUD UI + live preview + ratio)"
```

---

## Task 8: Quiz play server actions

**Files:**
- Create: `apps/web/src/app/quiz/actions.ts`

**Interfaces:**
- Consumes: `assertQuizOwner`; `splitSentences`, `buildQuiz`, `MIN_SENTENCES`, `QuizQuestion`; `getQuizConfig` from `@/lib/queries`.
- Produces:
  - `fetchNextQuiz(): Promise<QuizQuestion | null>` — `null` when no eligible passage exists.
  - `recordCorrect(): Promise<void>`

- [ ] **Step 1: Implement actions**

Create `apps/web/src/app/quiz/actions.ts`:

```ts
'use server';
import { initPool, getConnection, oracledb } from '@daily/db';
import { assertQuizOwner } from '@/lib/quiz-owner';
import { getQuizConfig } from '@/lib/queries';
import { splitSentences, buildQuiz, MIN_SENTENCES, type QuizQuestion } from '@/lib/quiz';

export async function fetchNextQuiz(): Promise<QuizQuestion | null> {
  await assertQuizOwner();
  const { blankPct } = await getQuizConfig();

  await initPool();
  const conn = await getConnection();
  try {
    // Save enforces >= MIN_SENTENCES, so a single random row is normally
    // eligible; fetch a small batch and pick the first eligible as defense.
    const result = await conn.execute<[string, string]>(
      `SELECT title, body FROM quiz_passages
       ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 5 ROWS ONLY`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    for (const [title, body] of result.rows ?? []) {
      const sentences = splitSentences(body);
      if (sentences.length >= MIN_SENTENCES) {
        return buildQuiz(sentences, title, blankPct, Math.random);
      }
    }
    return null;
  } finally {
    await conn.close();
  }
}

export async function recordCorrect(): Promise<void> {
  await assertQuizOwner();
  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `MERGE INTO quiz_daily d
       USING (SELECT TRUNC(SYSTIMESTAMP) AS day FROM dual) s
       ON (d.day = s.day)
       WHEN MATCHED THEN UPDATE SET d.correct_count = d.correct_count + 1
       WHEN NOT MATCHED THEN INSERT (day, correct_count) VALUES (s.day, 1)`,
      [],
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @daily/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/quiz/actions.ts
git commit -m "feat(web): quiz play actions (fetchNextQuiz, recordCorrect)"
```

---

## Task 9: Quiz landing — calendar + start button

**Files:**
- Create: `apps/web/src/app/quiz/Calendar.tsx`
- Create: `apps/web/src/app/quiz/page.tsx`

**Interfaces:**
- Consumes: `getMonthlyStats` from `@/lib/queries`; `auth` + `isQuizOwner`.
- Produces: route `/quiz` (accepts `?ym=YYYY-MM`).

- [ ] **Step 1: Calendar (server component)**

Create `apps/web/src/app/quiz/Calendar.tsx`:

```tsx
// Pure presentational month grid. `ym` is 'YYYY-MM'; `stats` maps day-of-month
// to correct count. Prev/next are 'YYYY-MM' strings for navigation links.
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function Calendar({ ym, stats }: { ym: string; stats: Map<number, number> }) {
  const [year, month] = ym.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <a
          href={`/quiz?ym=${shiftMonth(ym, -1)}`}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ←
        </a>
        <h2 className="text-base font-semibold">
          {year}-{String(month).padStart(2, '0')}
        </h2>
        <a
          href={`/quiz?ym=${shiftMonth(ym, 1)}`}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          →
        </a>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-xs font-medium text-gray-400 py-1">{w}</div>
        ))}
        {cells.map((day, i) => {
          const count = day ? stats.get(day) ?? 0 : 0;
          return (
            <div
              key={i}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs ${
                day ? 'border border-gray-100' : ''
              } ${count > 0 ? 'bg-green-50' : ''}`}
            >
              {day && (
                <>
                  <span className="text-gray-500">{day}</span>
                  {count > 0 && (
                    <span className="text-green-700 font-semibold text-sm">{count}</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Landing page (server)**

Create `apps/web/src/app/quiz/page.tsx`:

```tsx
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

const YM_RE = /^\d{4}-\d{2}$/;

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
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @daily/web typecheck && pnpm --filter @daily/web lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/quiz/Calendar.tsx apps/web/src/app/quiz/page.tsx
git commit -m "feat(web): quiz landing with monthly correct-count calendar"
```

---

## Task 10: Quiz player

**Files:**
- Create: `apps/web/src/app/quiz/play/QuizClient.tsx`
- Create: `apps/web/src/app/quiz/play/page.tsx`

**Interfaces:**
- Consumes: `fetchNextQuiz`, `recordCorrect` from `../actions`; `QuizQuestion` from `@/lib/quiz`; `auth` + `isQuizOwner`.
- Produces: route `/quiz/play`.

- [ ] **Step 1: Player (client state machine)**

Create `apps/web/src/app/quiz/play/QuizClient.tsx`:

```tsx
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
```

- [ ] **Step 2: Player shell (server)**

Create `apps/web/src/app/quiz/play/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @daily/web typecheck && pnpm --filter @daily/web lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/quiz/play
git commit -m "feat(web): quiz player state machine (answer reveal, choices, next)"
```

---

## Task 11: Conditional nav links

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `isQuizOwner` from `@/lib/quiz-owner`.

- [ ] **Step 1: Add imports + owner check**

In `apps/web/src/app/layout.tsx`, add at top with the other imports:

```tsx
import { isQuizOwner } from '@/lib/quiz-owner';
```

In `RootLayout`, after `const session = await auth();` add:

```tsx
  const quizOwner = isQuizOwner(session);
```

- [ ] **Step 2: Render quiz links conditionally**

Inside the `<nav>` block, after the existing `<NavLink href="/reports" label="Reports" />`, add:

```tsx
                {quizOwner && <NavLink href="/quiz" label="Quiz" />}
                {quizOwner && <NavLink href="/quiz-settings" label="Quiz Setting" />}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @daily/web typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev:web`
- Sign in as a non-owner admin → no Quiz links; visiting `/quiz` directly → 404.
- Sign in as `QUIZ_OWNER_EMAIL` → Quiz + Quiz Setting links appear; both pages load.

(Requires `QUIZ_OWNER_EMAIL` set locally in `apps/web/.env.local` and present in `ADMIN_EMAILS`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): show Quiz nav links only to owner"
```

---

## Task 12: Deploy wiring

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `QUIZ_OWNER_EMAIL` available to the web app at the same stage `ADMIN_EMAILS` is provided.

- [ ] **Step 1: Inspect how `ADMIN_EMAILS` is wired**

Run: `grep -n "ADMIN_EMAILS" .github/workflows/deploy.yml`
Expected: one or more lines showing whether it is a build arg, an env, or written into an env file.

- [ ] **Step 2: Mirror it for `QUIZ_OWNER_EMAIL`**

Add `QUIZ_OWNER_EMAIL` everywhere `ADMIN_EMAILS` appears (same mechanism — env, build-arg, or generated `.env`), sourced from `secrets.QUIZ_OWNER_EMAIL`. Verify the web Dockerfile/runtime reads it as a runtime env (server-only `process.env`), not a build-time inline.

- [ ] **Step 3: Register the GitHub secret (manual, operator)**

Document in the PR description: add repo secret `QUIZ_OWNER_EMAIL=galaxytemple@gmail.com`, and ensure that address is included in the `ADMIN_EMAILS` secret so the owner can sign in.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: wire QUIZ_OWNER_EMAIL secret into web deploy"
```

---

## Post-Implementation (manual, operator)

1. Push branch, open PR.
2. After merge/deploy, apply migration: `pnpm db:migrate` then `pnpm db:info` to confirm V7.
3. Add `QUIZ_OWNER_EMAIL` GitHub secret + include it in `ADMIN_EMAILS`.
4. Smoke test: sign in as owner → add a passage (≥5 sentences) → play both formats → confirm calendar increments on a correct answer.
```
