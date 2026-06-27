# Quiz Feature — Design

Date: 2026-06-27
Status: Approved (design), pending implementation plan

## Goal

Add an owner-only English-passage quiz feature to the daily-report web app. Two
nav sections — **Quiz** and **Quiz Setting** — visible and accessible only to a
single owner identified by `QUIZ_OWNER_EMAIL`. The owner stores passages, then
practices via an infinitely repeating quiz, with a motivational calendar of daily
correct counts.

## Access Gating

- **Owner identity** comes from `process.env.QUIZ_OWNER_EMAIL` (a GitHub secret,
  wired like other deploy env). It is **never** exposed to the client: only the
  server reads it; the client receives at most a boolean. No `NEXT_PUBLIC_` use.
- Login still requires the email to be in `ADMIN_EMAILS` (existing `signIn`
  callback). Operationally `QUIZ_OWNER_EMAIL` must also be in `ADMIN_EMAILS`.
- A server-only gating module (`import 'server-only'` at top → build error if it
  leaks into a client bundle) exports `isQuizOwner(session)`.
- `layout.tsx` (server component) renders the `Quiz` / `Quiz Setting` nav links
  only when `isQuizOwner` is true — only the boolean result reaches rendered HTML.
- Every quiz page server section and every quiz server action re-checks
  `isQuizOwner`; on failure → `notFound()` (defense in depth against direct URLs).

## Data Model — `db/migrations/V7__quiz.sql`

```sql
CREATE TABLE quiz_passages (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      VARCHAR2(500) NOT NULL,
  body       CLOB          NOT NULL,
  created_at TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE quiz_daily (
  day           DATE PRIMARY KEY,
  correct_count NUMBER NOT NULL
);

CREATE TABLE quiz_config (
  id        NUMBER PRIMARY KEY CHECK (id = 1),
  blank_pct NUMBER NOT NULL CHECK (blank_pct BETWEEN 0 AND 100)
);
INSERT INTO quiz_config (id, blank_pct) VALUES (1, 50);
```

- Passage = `title` + `body` (CLOB, ~4 paragraphs / ~50 sentences) stored as one
  blob. Sentence splitting happens at **quiz/preview time**, not at save (original
  text preserved, editing stays simple). CLOBs already return as strings via the
  driver-level `fetchAsString` config.
- `quiz_daily` records **correct answers only** (motivation); wrong answers are
  not stored. Single owner → no user column.
- `quiz_config` is a single enforced row holding the format ratio.
- `@daily/db` gains a `Passage` interface.

## Pure Quiz Logic — `apps/web/src/lib/quiz.ts`

Pure, dependency-free, RNG-injected for deterministic tests.

- `splitSentences(text: string): string[]` — split on `.?!` followed by
  whitespace, keeping the punctuation with the sentence; trims; drops empties.
- `buildBlankQuiz(sentences, rng): QuizQuestion` — pick a random blank index;
  `prev`/`next` are the immediate neighbors across the whole passage (null at
  ends, ignoring paragraph boundaries); 2 distractors chosen at random from the
  same passage **excluding the answer, prev, and next**; answer + distractors
  shuffled into `choices`.
- `buildFirstSentenceQuiz(sentences, rng): QuizQuestion` — answer = `sentences[0]`;
  2 distractors from `sentences[1..]`; title is the prompt (carried by the DTO).
- `buildQuiz(sentences, blankPct, rng): QuizQuestion` — roll `rng` against
  `blankPct` to choose format, then dispatch.

`rng: () => number` is injected (defaults to `Math.random`) so tests are
deterministic.

### `QuizQuestion` DTO (discriminated union)

```ts
type QuizQuestion =
  | { format: 'blank'; passageTitle: string; prev: string | null;
      next: string | null; choices: string[]; answerIndex: number }
  | { format: 'firstSentence'; passageTitle: string;
      choices: string[]; answerIndex: number };
```

`choices` always length 3; `answerIndex` is the index of the correct choice.

### Minimum sentences

A passage needs **≥ 5 sentences** to be quizzable (blank format worst case:
answer + prev + next excluded, still need 2 distractors). Enforced on save and
re-checked at quiz time (passages with < 5 sentences are skipped when picking).

## Server Actions & Queries

`apps/web/src/lib/queries.ts`:
- `getPassages(): Passage[]`
- `getQuizConfig(): { blankPct: number }`
- `getMonthlyStats(year, month): Map<dayOfMonth, correctCount>`

Quiz Setting actions (`app/quiz-settings/actions.ts`, all owner-guarded +
server-side re-validation):
- `createPassage(formData)` — `title` (1–500), `body` required, `splitSentences`
  ≥ 5.
- `updatePassage(id, formData)` — same validation.
- `deletePassage(id)` — confirm then delete.
- `updateQuizConfig(formData)` — `blank_pct` integer 0–100.

Quiz play actions (`app/quiz/actions.ts`, owner-guarded):
- `fetchNextQuiz(): QuizQuestion` — read `blank_pct`; pick a random passage with
  ≥ 5 sentences (`ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 1 ROW`); `splitSentences`
  → `buildQuiz`. Throws a typed empty state if no eligible passage exists.
- `recordCorrect(): void` — MERGE upsert today's `quiz_daily` row (+1). "Today" =
  `TRUNC(SYSTIMESTAMP)` under session TZ +09:00 (existing `getConnection` pattern).

## Pages & Components

Routes:
- `/quiz` — **landing** (server, owner-guarded): month calendar + `퀴즈 시작`
  button linking to `/quiz/play`. `?ym=YYYY-MM` selects the month; prev/next month
  links. Each day cell shows its correct count. Mobile-responsive 7-column grid,
  cells stay square on small screens. `dynamic = 'force-dynamic'`.
- `/quiz/play` — **player** (server shell, owner-guarded): SSRs the first question
  then hands off to `QuizClient`.
- `/quiz-settings` — passage CRUD + ratio config (server, owner-guarded).

Components:
- `app/quiz/QuizClient.tsx` (client) — state machine:
  1. **question** — render prompt by format (`blank`: prev / `____` / next;
     `firstSentence`: title) + `Answer` button only.
  2. Answer → reveal 3 choices.
  3. Select a choice → mark ✓/✗, reveal the completed/correct sentence; if
     correct, call `recordCorrect()`.
  4. `Next` (bottom) → `fetchNextQuiz()`, reset, infinite loop.
- `app/quiz-settings/PassageForm.tsx` (client, reused for create + edit) — title
  input + body textarea with a **live sentence-split preview** (numbered list via
  `splitSentences`) and sentence count; warns when < 5. Submits to the server
  action, which re-validates independently.
- `app/quiz-settings/DeletePassageButton.tsx` (client) — `window.confirm`
  (mirrors `DeleteThemeButton`).

All UI uses Tailwind v4, single-column mobile-first layouts, large tap targets.

## Empty States

- No passages / none with ≥ 5 sentences → quiz shows "등록된 지문이 없습니다".
- Calendar with no records → grid renders with zero counts.

## Testing

- Add `vitest` to `apps/web` (other apps already use it).
- `apps/web/src/lib/quiz.test.ts` — TDD `splitSentences`, `buildBlankQuiz`,
  `buildFirstSentenceQuiz`, `buildQuiz` with an injected deterministic `rng`
  (boundary cases: blank at first/last sentence, exactly 5 sentences, ratio
  selection at blankPct 0 / 100).

## Deployment Notes

- Add `QUIZ_OWNER_EMAIL` GitHub secret and wire it into the web build/runtime env
  (`deploy.yml`), the same way as existing secrets — verify whether it must be a
  build arg or a runtime env for the web container.
- Ensure `QUIZ_OWNER_EMAIL`'s address is included in `ADMIN_EMAILS` so the owner
  can sign in.
- `V7__quiz.sql` is applied manually via Flyway after push (per project runbook).
```
