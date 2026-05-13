# Daily Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnpm monorepo with 4 apps (crawler, job, archivist, web) + shared Oracle DB package that collects social/news sentiment data, runs local LLM analysis, and sends daily email reports.

**Architecture:** share-pad pattern — pnpm monorepo, Oracle 23ai (Autonomous DB Free) via wallet, Flyway migrations run manually from terminal only, Ollama on OCI host reached via host.docker.internal, Caddy reverse proxy, rsync CI/CD.

**Tech Stack:** TypeScript, Node.js 22, Next.js 16, Auth.js v5, oracledb v6, ollama npm, snoowrap, agent-twitter-client, rss-parser, yahoo-finance2, nodemailer, node-cron, Flyway 10, Docker, Caddy, GitHub Actions

---

## File Map

```
daily-report/
├── package.json                          # root pnpm scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── scripts/dc                            # docker compose wrapper
├── packages/db/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # re-exports
│       ├── pool.ts                       # oracledb pool factory
│       └── schema.ts                     # shared TypeScript types
├── db/
│   ├── flyway.conf
│   └── migrations/
│       ├── V1__initial_schema.sql
│       └── V2__vector_index.sql
├── apps/crawler/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                      # cron scheduler
│       ├── sources/
│       │   ├── news.ts                   # rss-parser + yahoo-finance2
│       │   ├── reddit.ts                 # snoowrap
│       │   └── twitter.ts               # agent-twitter-client
│       ├── embed.ts                      # Ollama nomic-embed-text
│       ├── store.ts                      # RAW_DATA insert + dedup
│       └── __tests__/
│           ├── store.test.ts
│           └── embed.test.ts
├── apps/job/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                      # per-topic cron from DB
│       ├── rag.ts                        # Oracle Vector Search
│       ├── analyze.ts                    # Ollama gemma2:27b
│       ├── report.ts                     # save DAILY_REPORTS
│       ├── email.ts                      # Nodemailer + OCI SMTP
│       └── __tests__/
│           ├── rag.test.ts
│           └── report.test.ts
├── apps/archivist/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                      # cron at 03:00
│       ├── summarize.ts                  # Ollama top-10 per topic
│       ├── purge.ts                      # delete RAW_DATA + null old reports
│       └── __tests__/
│           └── purge.test.ts
├── apps/web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── src/
│       ├── auth.ts                       # Auth.js config
│       ├── middleware.ts
│       ├── lib/queries.ts                # DB queries for web
│       └── app/
│           ├── layout.tsx
│           ├── page.tsx                  # → /topics redirect
│           ├── topics/
│           │   ├── page.tsx
│           │   └── actions.ts            # server actions CRUD
│           ├── dashboard/page.tsx
│           └── reports/page.tsx
└── docker/
    ├── docker-compose.yml
    ├── Caddyfile
    ├── web.Dockerfile
    ├── crawler.Dockerfile
    ├── job.Dockerfile
    └── archivist.Dockerfile
```

---

## Phase 1: Foundation

### Task 1: Root monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `scripts/dc`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "daily-report",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev:web": "pnpm --filter @daily/web dev",
    "dev:crawler": "pnpm --filter @daily/crawler dev",
    "dev:job": "pnpm --filter @daily/job dev",
    "dev:archivist": "pnpm --filter @daily/archivist dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "dc": "./scripts/dc",
    "db:migrate": "./scripts/dc --profile tools run --rm flyway migrate",
    "db:info": "./scripts/dc --profile tools run --rm flyway info",
    "db:validate": "./scripts/dc --profile tools run --rm flyway validate",
    "db:repair": "./scripts/dc --profile tools run --rm flyway repair"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.next/
dist/
*.tsbuildinfo
.env
wallet/
data/
```

- [ ] **Step 5: Create .env.example**

```bash
# Oracle DB — app user (DML only, used by all apps)
ORACLE_USER=daily_app
ORACLE_PASSWORD=
ORACLE_TNS_NAME=daily_high
ORACLE_SCHEMA=DAILY_SCHEMA
ORACLE_WALLET_DIR=./wallet
ORACLE_WALLET_PASSWORD=

# Oracle DB — schema owner (DDL, Flyway only — never used by app)
ORACLE_SCHEMA_PASSWORD=

# Ollama (host on OCI; use host.docker.internal in Docker)
OLLAMA_URL=http://localhost:11434

# OCI SMTP
ORACLE_SMTP_HOST=smtp.email.us-ashburn-1.oraclecloud.com
ORACLE_SMTP_PORT=587
ORACLE_SMTP_USER=
ORACLE_SMTP_PASS=
SMTP_FROM=noreply@yourdomain.com

# Reddit API
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USERNAME=
REDDIT_PASSWORD=

# Twitter / X
TWITTER_USERNAME=
TWITTER_PASSWORD=

# Auth.js (web only)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_TRUST_HOST=true
AUTH_URL=https://yourdomain.com
ADMIN_EMAILS=you@example.com

# Public
PUBLIC_HOST=yourdomain.com
PUBLIC_IP=
```

- [ ] **Step 6: Create scripts/dc and make it executable**

```bash
#!/usr/bin/env bash
# Thin wrapper so pnpm scripts can call docker compose with the right env-file
# and compose file without having to repeat flags everywhere.
set -euo pipefail
exec docker compose \
  --project-name daily-report \
  --env-file "$(dirname "$0")/../.env" \
  -f "$(dirname "$0")/../docker/docker-compose.yml" \
  "$@"
```

```bash
chmod +x scripts/dc
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example scripts/
git commit -m "chore: root monorepo scaffold"
```

---

### Task 2: packages/db — Oracle connection pool

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/pool.ts`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "@daily/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "oracledb": "^6.7.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/db/src/schema.ts**

```typescript
export interface Topic {
  id: number;
  keyword: string;
  email: string;
  cronTime: string;
  active: number;
  createdAt: Date;
}

export interface RawData {
  id: number;
  topicId: number;
  source: 'reddit' | 'twitter' | 'news';
  url: string | null;
  title: string | null;
  body: string | null;
  sentiment: number | null;
  createdAt: Date;
}

export interface DailyReport {
  id: number;
  topicId: number;
  content: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface ArchivedSummary {
  id: number;
  topicId: number;
  reportDate: Date;
  rank: number;
  source: string;
  url: string | null;
  title: string | null;
  summary: string;
  sentiment: number | null;
  createdAt: Date;
}
```

- [ ] **Step 4: Create packages/db/src/pool.ts**

```typescript
import oracledb from 'oracledb';

let initialised = false;

export async function initPool(): Promise<void> {
  if (initialised) return;

  await oracledb.createPool({
    user: process.env.ORACLE_USER!,
    password: process.env.ORACLE_PASSWORD!,
    connectString: process.env.ORACLE_TNS_NAME!,
    configDir: process.env.ORACLE_WALLET_DIR!,
    walletLocation: process.env.ORACLE_WALLET_DIR,
    walletPassword: process.env.ORACLE_WALLET_PASSWORD,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
    sessionCallback: async (conn) => {
      if (process.env.ORACLE_SCHEMA) {
        await conn.execute(
          `ALTER SESSION SET CURRENT_SCHEMA = "${process.env.ORACLE_SCHEMA}"`,
        );
      }
    },
  });

  initialised = true;
}

export async function getConnection(): Promise<oracledb.Connection> {
  return oracledb.getConnection();
}

export { oracledb };
```

- [ ] **Step 5: Create packages/db/src/index.ts**

```typescript
export { initPool, getConnection, oracledb } from './pool.js';
export type { Topic, RawData, DailyReport, ArchivedSummary } from './schema.js';
```

- [ ] **Step 6: Install packages/db deps**

```bash
pnpm install
```

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @daily/db typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/
git commit -m "feat: packages/db — Oracle connection pool"
```

---

### Task 3: DB migrations

**Files:**
- Create: `db/flyway.conf`
- Create: `db/migrations/V1__initial_schema.sql`
- Create: `db/migrations/V2__vector_index.sql`

Prerequisites: create the two Oracle users manually before running Flyway:
```sql
-- Connect as ADMIN and run:
CREATE USER daily_schema IDENTIFIED BY "<strong-password>"
  DEFAULT TABLESPACE DATA QUOTA UNLIMITED ON DATA;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE,
      CREATE INDEX, CREATE VIEW TO daily_schema;

CREATE USER daily_app IDENTIFIED BY "<strong-password>";
GRANT CREATE SESSION TO daily_app;
-- Grants added after V1 runs:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON daily_schema.topics TO daily_app;
-- (repeat for each table)
```

- [ ] **Step 1: Create db/flyway.conf**

```properties
# Flyway config — runtime values come from env (FLYWAY_URL, FLYWAY_USER, FLYWAY_PASSWORD)
# supplied by docker-compose tools profile.
flyway.locations=filesystem:/flyway/sql
flyway.baselineOnMigrate=true
flyway.baselineVersion=0
flyway.validateOnMigrate=true
flyway.outOfOrder=false
flyway.encoding=UTF-8
```

- [ ] **Step 2: Create db/migrations/V1__initial_schema.sql**

```sql
-- Flyway runs as DAILY_SCHEMA (DDL user); all objects land in that schema.

CREATE TABLE topics (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword    VARCHAR2(500)  NOT NULL,
  email      VARCHAR2(255)  NOT NULL,
  cron_time  VARCHAR2(50)   NOT NULL,
  active     NUMBER(1)      DEFAULT 1 NOT NULL CHECK (active IN (0,1)),
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE raw_data (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id   NUMBER         NOT NULL REFERENCES topics(id),
  source     VARCHAR2(50)   NOT NULL CHECK (source IN ('reddit','twitter','news')),
  url        VARCHAR2(2000),
  title      VARCHAR2(1000),
  body       CLOB,
  embedding  VECTOR(768, FLOAT32),
  sentiment  NUMBER(3,2),
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE daily_reports (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id   NUMBER         NOT NULL REFERENCES topics(id),
  content    CLOB,
  sent_at    TIMESTAMP,
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE archived_summary (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    NUMBER         NOT NULL REFERENCES topics(id),
  report_date DATE           NOT NULL,
  rank        NUMBER(2)      NOT NULL CHECK (rank BETWEEN 1 AND 10),
  source      VARCHAR2(50)   NOT NULL,
  url         VARCHAR2(2000),
  title       VARCHAR2(1000),
  summary     VARCHAR2(1000) NOT NULL,
  sentiment   NUMBER(3,2),
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

-- Allow app user (daily_app) DML access
GRANT SELECT, INSERT, UPDATE, DELETE ON topics        TO daily_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON raw_data      TO daily_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_reports TO daily_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON archived_summary TO daily_app;
```

- [ ] **Step 3: Create db/migrations/V2__vector_index.sql**

```sql
-- Vector index for fast similarity search on raw_data.embedding.
-- IVF (Inverted File) with 2 neighbor partitions — appropriate for small datasets.
-- Increase neighbor_partitions if data grows beyond ~100k rows.
CREATE VECTOR INDEX raw_data_emb_vidx
  ON raw_data (embedding)
  ORGANIZATION NEIGHBOR PARTITIONS
  WITH TARGET ACCURACY 90
  DISTANCE COSINE
  PARAMETERS (type IVF, neighbor partitions 2);
```

- [ ] **Step 4: Add Flyway service to docker-compose (stub for now)**

Create `docker/docker-compose.yml` with just the Flyway tools profile for this task:

```yaml
# docker/docker-compose.yml — full file added in Phase 6; stub here for db:migrate
services:
  flyway:
    image: flyway/flyway:10-alpine
    profiles: ["tools"]
    environment:
      FLYWAY_URL: "jdbc:oracle:thin:@${ORACLE_TNS_NAME}?TNS_ADMIN=${ORACLE_WALLET_DIR}"
      FLYWAY_USER: "${ORACLE_SCHEMA}"
      FLYWAY_PASSWORD: "${ORACLE_SCHEMA_PASSWORD}"
    volumes:
      - ../db/migrations:/flyway/sql:ro
      - ../db/flyway.conf:/flyway/conf/flyway.conf:ro
      - ../wallet:/wallet:ro
    command: ["-configFiles=/flyway/conf/flyway.conf", "info"]
```

- [ ] **Step 5: Run migration (with wallet and .env in place)**

```bash
pnpm db:migrate
```

Expected: `Successfully applied 2 migrations` (or `Schema version: 2` in info output).

- [ ] **Step 6: Commit**

```bash
git add db/ docker/docker-compose.yml
git commit -m "feat: DB migrations V1 (schema) + V2 (vector index)"
```

---

## Phase 2: Crawler

### Task 4: apps/crawler scaffold + news source

**Files:**
- Create: `apps/crawler/package.json`
- Create: `apps/crawler/tsconfig.json`
- Create: `apps/crawler/vitest.config.ts`
- Create: `apps/crawler/src/sources/news.ts`
- Create: `apps/crawler/src/__tests__/store.test.ts` (stub)

- [ ] **Step 1: Create apps/crawler/package.json**

```json
{
  "name": "@daily/crawler",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@daily/db": "workspace:*",
    "ollama": "^0.5.0",
    "rss-parser": "^3.13.0",
    "snoowrap": "^1.23.0",
    "agent-twitter-client": "^0.0.18",
    "yahoo-finance2": "^2.11.0",
    "node-cron": "^3.0.3",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/snoowrap": "^1.23.0",
    "@types/node-cron": "^3.0.11",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create apps/crawler/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "paths": { "@daily/db": ["../../packages/db/src/index.ts"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/crawler/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 4: Write failing test for news source**

Create `apps/crawler/src/__tests__/news.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: vi.fn().mockResolvedValue({
      items: [
        { title: 'Oil prices rise', link: 'https://example.com/1', contentSnippet: 'Oil went up.' },
        { title: 'Fed holds rates', link: 'https://example.com/2', contentSnippet: 'Fed stays.' },
      ],
    }),
  })),
}));

vi.mock('yahoo-finance2', () => ({
  default: { search: vi.fn().mockResolvedValue({ news: [
    { title: 'AAPL hits high', link: 'https://finance.yahoo.com/1', summary: 'Apple stock rose.' },
  ] }) },
}));

import { fetchNews } from '../sources/news.js';

describe('fetchNews', () => {
  it('returns combined RSS + Yahoo Finance items', async () => {
    const items = await fetchNews('oil price');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({ source: 'news', title: expect.any(String) });
  });

  it('returns items with required fields', async () => {
    const items = await fetchNews('apple');
    for (const item of items) {
      expect(item).toHaveProperty('source', 'news');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('body');
    }
  });
});
```

- [ ] **Step 5: Run test — expect FAIL**

```bash
pnpm --filter @daily/crawler test
```

Expected: FAIL — `Cannot find module '../sources/news.js'`

- [ ] **Step 6: Implement apps/crawler/src/sources/news.ts**

```typescript
import Parser from 'rss-parser';
import yahooFinance from 'yahoo-finance2';

export interface CrawledItem {
  source: 'reddit' | 'twitter' | 'news';
  url: string | null;
  title: string;
  body: string;
}

const RSS_FEEDS = [
  'https://feeds.finance.yahoo.com/rss/2.0/headline',
  'https://www.investing.com/rss/news.rss',
];

export async function fetchNews(keyword: string): Promise<CrawledItem[]> {
  const parser = new Parser();
  const items: CrawledItem[] = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const entry of feed.items) {
        const text = `${entry.title ?? ''} ${entry.contentSnippet ?? ''}`.toLowerCase();
        if (!text.includes(keyword.toLowerCase())) continue;
        items.push({
          source: 'news',
          url: entry.link ?? null,
          title: entry.title ?? '',
          body: entry.contentSnippet ?? entry.title ?? '',
        });
      }
    } catch {
      // skip unreachable feeds
    }
  }

  try {
    const result = await yahooFinance.search(keyword, { newsCount: 10 });
    for (const n of result.news ?? []) {
      items.push({
        source: 'news',
        url: n.link ?? null,
        title: n.title ?? '',
        body: n.summary ?? n.title ?? '',
      });
    }
  } catch {
    // skip on API error
  }

  return items;
}
```

- [ ] **Step 7: Run test — expect PASS**

```bash
pnpm --filter @daily/crawler test
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/crawler/
git commit -m "feat: crawler — news source (RSS + Yahoo Finance)"
```

---

### Task 5: Reddit source

**Files:**
- Create: `apps/crawler/src/sources/reddit.ts`
- Create: `apps/crawler/src/__tests__/reddit.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/crawler/src/__tests__/reddit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('snoowrap', () => ({
  default: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([
      { title: 'Oil stocks surge', selftext: 'Everyone is buying.', url: 'https://reddit.com/r/stocks/1', id: 'abc1' },
      { title: 'Market update', selftext: 'Down 2% today.', url: 'https://reddit.com/r/investing/2', id: 'abc2' },
    ]),
  })),
}));

import { fetchReddit } from '../sources/reddit.js';

describe('fetchReddit', () => {
  it('returns items with source=reddit', async () => {
    const items = await fetchReddit('oil');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('reddit');
  });

  it('maps url from post url', async () => {
    const items = await fetchReddit('oil');
    expect(items[0].url).toContain('reddit.com');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @daily/crawler test
```

Expected: FAIL — `Cannot find module '../sources/reddit.js'`

- [ ] **Step 3: Implement apps/crawler/src/sources/reddit.ts**

```typescript
import Snoowrap from 'snoowrap';
import type { CrawledItem } from './news.js';

function buildClient(): Snoowrap {
  return new Snoowrap({
    userAgent: 'daily-report/1.0 by sanghoon@giboo.com',
    clientId: process.env.REDDIT_CLIENT_ID!,
    clientSecret: process.env.REDDIT_CLIENT_SECRET!,
    username: process.env.REDDIT_USERNAME!,
    password: process.env.REDDIT_PASSWORD!,
  });
}

export async function fetchReddit(keyword: string): Promise<CrawledItem[]> {
  const reddit = buildClient();
  const posts = await reddit.search({ query: keyword, sort: 'new', time: 'day', limit: 25 });

  return posts.map((post) => ({
    source: 'reddit' as const,
    url: post.url,
    title: post.title,
    body: post.selftext || post.title,
  }));
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @daily/crawler test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crawler/src/sources/reddit.ts apps/crawler/src/__tests__/reddit.test.ts
git commit -m "feat: crawler — Reddit source"
```

---

### Task 6: Twitter/X source

**Files:**
- Create: `apps/crawler/src/sources/twitter.ts`
- Create: `apps/crawler/src/__tests__/twitter.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/crawler/src/__tests__/twitter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('agent-twitter-client', () => ({
  Scraper: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue(undefined),
    searchTweets: vi.fn().mockImplementation(async function* () {
      yield { id: '1', text: 'Oil prices going up #stocks', permanentUrl: 'https://x.com/user/1' };
      yield { id: '2', text: 'Fed decision tomorrow', permanentUrl: 'https://x.com/user/2' };
    }),
  })),
}));

import { fetchTwitter } from '../sources/twitter.js';

describe('fetchTwitter', () => {
  it('returns items with source=twitter', async () => {
    const items = await fetchTwitter('oil');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('twitter');
  });

  it('uses tweet text as body', async () => {
    const items = await fetchTwitter('oil');
    expect(items[0].body).toContain('Oil prices');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @daily/crawler test
```

Expected: FAIL — `Cannot find module '../sources/twitter.js'`

- [ ] **Step 3: Implement apps/crawler/src/sources/twitter.ts**

```typescript
import { Scraper } from 'agent-twitter-client';
import type { CrawledItem } from './news.js';

let scraper: Scraper | null = null;

async function getScraper(): Promise<Scraper> {
  if (scraper) return scraper;
  scraper = new Scraper();
  await scraper.login(
    process.env.TWITTER_USERNAME!,
    process.env.TWITTER_PASSWORD!,
  );
  return scraper;
}

export async function fetchTwitter(keyword: string): Promise<CrawledItem[]> {
  const s = await getScraper();
  const items: CrawledItem[] = [];

  for await (const tweet of s.searchTweets(`${keyword} lang:en`, 20)) {
    if (!tweet.text) continue;
    items.push({
      source: 'twitter' as const,
      url: tweet.permanentUrl ?? null,
      title: tweet.text.slice(0, 100),
      body: tweet.text,
    });
  }

  return items;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @daily/crawler test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crawler/src/sources/twitter.ts apps/crawler/src/__tests__/twitter.test.ts
git commit -m "feat: crawler — Twitter/X source"
```

---

### Task 7: Embedding, store, and cron scheduler

**Files:**
- Create: `apps/crawler/src/embed.ts`
- Create: `apps/crawler/src/store.ts`
- Create: `apps/crawler/src/index.ts`
- Create: `apps/crawler/src/__tests__/store.test.ts`
- Create: `apps/crawler/src/__tests__/embed.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/crawler/src/__tests__/embed.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    embed: vi.fn().mockResolvedValue({ embeddings: [new Array(768).fill(0.1)] }),
  })),
}));

import { embedText } from '../embed.js';

describe('embedText', () => {
  it('returns a 768-dim float array', async () => {
    const vec = await embedText('hello world');
    expect(vec).toHaveLength(768);
    expect(typeof vec[0]).toBe('number');
  });
});
```

Create `apps/crawler/src/__tests__/store.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: mockExecute, close: mockClose }),
  oracledb: { DB_TYPE_VECTOR: 'vector' },
}));

import { storeItem } from '../store.js';
import type { CrawledItem } from '../sources/news.js';

describe('storeItem', () => {
  it('inserts a row and returns true', async () => {
    const item: CrawledItem = { source: 'news', url: 'https://example.com', title: 'Test', body: 'Body text' };
    const result = await storeItem(1, item, [0.1, 0.2]);
    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalled();
  });

  it('skips duplicate URL for same topic+date and returns false', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [[1]] }) // dedup check finds existing
    const item: CrawledItem = { source: 'news', url: 'https://existing.com', title: 'Dup', body: 'Dup' };
    const result = await storeItem(1, item, [0.1]);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @daily/crawler test
```

Expected: FAIL — `Cannot find module '../embed.js'` and `'../store.js'`

- [ ] **Step 3: Implement apps/crawler/src/embed.ts**

```typescript
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

export async function embedText(text: string): Promise<number[]> {
  const res = await ollama.embed({ model: 'nomic-embed-text', input: text.slice(0, 2000) });
  return res.embeddings[0];
}
```

- [ ] **Step 4: Implement apps/crawler/src/store.ts**

```typescript
import { getConnection, oracledb } from '@daily/db';
import type { CrawledItem } from './sources/news.js';

export async function storeItem(
  topicId: number,
  item: CrawledItem,
  embedding: number[],
): Promise<boolean> {
  const conn = await getConnection();
  try {
    // Dedup: skip if same url+topic already inserted today
    if (item.url) {
      const dup = await conn.execute<[number]>(
        `SELECT 1 FROM raw_data
         WHERE topic_id = :tid AND url = :url
           AND TRUNC(created_at) = TRUNC(SYSTIMESTAMP)
         FETCH FIRST 1 ROWS ONLY`,
        { tid: topicId, url: item.url },
      );
      if ((dup.rows?.length ?? 0) > 0) return false;
    }

    await conn.execute(
      `INSERT INTO raw_data (topic_id, source, url, title, body, embedding)
       VALUES (:tid, :src, :url, :title, :body, :emb)`,
      {
        tid: topicId,
        src: item.source,
        url: item.url,
        title: item.title?.slice(0, 1000) ?? null,
        body: item.body,
        emb: { val: new Float32Array(embedding), type: oracledb.DB_TYPE_VECTOR },
      },
      { autoCommit: true },
    );
    return true;
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @daily/crawler test
```

Expected: all PASS

- [ ] **Step 6: Implement apps/crawler/src/index.ts**

```typescript
import cron from 'node-cron';
import { initPool, getConnection } from '@daily/db';
import type { Topic } from '@daily/db';
import { fetchNews } from './sources/news.js';
import { fetchReddit } from './sources/reddit.js';
import { fetchTwitter } from './sources/twitter.js';
import { embedText } from './embed.js';
import { storeItem } from './store.js';

async function crawlTopic(topic: Topic): Promise<void> {
  const allItems = await Promise.allSettled([
    fetchNews(topic.keyword),
    fetchReddit(topic.keyword),
    fetchTwitter(topic.keyword),
  ]);

  const items = allItems.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  for (const item of items) {
    const text = `${item.title} ${item.body}`.slice(0, 2000);
    const embedding = await embedText(text);
    await storeItem(topic.id, item, embedding);
  }

  console.log(`[crawler] topic=${topic.id} "${topic.keyword}" — ${items.length} items processed`);
}

async function runCrawl(): Promise<void> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, string, number]>(
      `SELECT id, keyword, email, cron_time, active FROM topics WHERE active = 1`,
      [],
      { outFormat: (await import('@daily/db')).oracledb.OUT_FORMAT_ARRAY },
    );
    const topics: Topic[] = (result.rows ?? []).map(([id, keyword, email, cronTime, active]) => ({
      id, keyword, email, cronTime, active, createdAt: new Date(),
    }));
    await Promise.allSettled(topics.map(crawlTopic));
  } finally {
    await conn.close();
  }
}

async function main(): Promise<void> {
  await initPool();
  // Run immediately on start, then every hour
  await runCrawl();
  cron.schedule('0 * * * *', runCrawl);
  console.log('[crawler] started — running every hour');
}

main().catch(console.error);
```

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @daily/crawler typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/crawler/
git commit -m "feat: crawler — embed, store, cron scheduler"
```

---

## Phase 3: Daily Job

### Task 8: apps/job scaffold + RAG query

**Files:**
- Create: `apps/job/package.json`
- Create: `apps/job/tsconfig.json`
- Create: `apps/job/vitest.config.ts`
- Create: `apps/job/src/rag.ts`
- Create: `apps/job/src/__tests__/rag.test.ts`

- [ ] **Step 1: Create apps/job/package.json**

```json
{
  "name": "@daily/job",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@daily/db": "workspace:*",
    "ollama": "^0.5.0",
    "nodemailer": "^6.9.0",
    "node-cron": "^3.0.3",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/nodemailer": "^6.4.0",
    "@types/node-cron": "^3.0.11",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create apps/job/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "paths": { "@daily/db": ["../../packages/db/src/index.ts"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/job/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', globals: true } });
```

- [ ] **Step 4: Write failing test for RAG**

Create `apps/job/src/__tests__/rag.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({
  rows: [
    { TITLE: 'Oil surge explained', BODY: 'Crude oil rose 5%.', URL: 'https://example.com/1' },
    { TITLE: 'OPEC cuts output', BODY: 'OPEC reduced by 1mbpd.', URL: 'https://example.com/2' },
  ],
});
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: mockExecute, close: mockClose }),
  oracledb: { OUT_FORMAT_OBJECT: 'object', DB_TYPE_VECTOR: 'vector' },
}));

import { retrieveContext } from '../rag.js';

describe('retrieveContext', () => {
  it('returns passages from DB', async () => {
    const passages = await retrieveContext(1, [0.1, 0.2, 0.3]);
    expect(passages.length).toBe(2);
    expect(passages[0]).toHaveProperty('title');
    expect(passages[0]).toHaveProperty('body');
  });
});
```

- [ ] **Step 5: Run test — expect FAIL**

```bash
pnpm --filter @daily/job test
```

Expected: FAIL — `Cannot find module '../rag.js'`

- [ ] **Step 6: Implement apps/job/src/rag.ts**

```typescript
import { getConnection, oracledb } from '@daily/db';

export interface Passage {
  title: string;
  body: string;
  url: string | null;
}

export async function retrieveContext(topicId: number, queryEmbedding: number[]): Promise<Passage[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<{ TITLE: string; BODY: string; URL: string | null }>(
      `SELECT title, body, url
       FROM raw_data
       WHERE topic_id = :tid
         AND TRUNC(created_at) = TRUNC(SYSTIMESTAMP)
       ORDER BY VECTOR_DISTANCE(embedding, :qvec, COSINE)
       FETCH FIRST 20 ROWS ONLY`,
      {
        tid: topicId,
        qvec: { val: new Float32Array(queryEmbedding), type: oracledb.DB_TYPE_VECTOR },
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return (result.rows ?? []).map((r) => ({
      title: r.TITLE,
      body: r.BODY,
      url: r.URL,
    }));
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 7: Run test — expect PASS**

```bash
pnpm --filter @daily/job test
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/job/
git commit -m "feat: job — RAG query with Oracle Vector Search"
```

---

### Task 9: Ollama analysis + report persistence

**Files:**
- Create: `apps/job/src/analyze.ts`
- Create: `apps/job/src/report.ts`
- Create: `apps/job/src/__tests__/report.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/job/src/__tests__/report.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({ rows: [[42]] });
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: mockExecute, close: mockClose }),
  oracledb: { OUT_FORMAT_ARRAY: 'array' },
}));

import { saveReport } from '../report.js';

describe('saveReport', () => {
  it('inserts a report and returns the new id', async () => {
    const id = await saveReport(1, '# Daily Report\n\nBullish on oil.');
    expect(id).toBe(42);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO daily_reports'),
      expect.any(Object),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @daily/job test
```

Expected: FAIL — `Cannot find module '../report.js'`

- [ ] **Step 3: Implement apps/job/src/analyze.ts**

```typescript
import { Ollama } from 'ollama';
import type { Passage } from './rag.js';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

export async function analyzeWithOllama(keyword: string, passages: Passage[]): Promise<string> {
  const context = passages
    .map((p, i) => `[${i + 1}] ${p.title}\n${p.body}`)
    .join('\n\n');

  const prompt = `You are a financial and social sentiment analyst.

Topic: "${keyword}"

Below are today's collected news, Reddit posts, and tweets related to this topic:

${context}

Write a concise daily report in Markdown covering:
1. Key developments and their market implications
2. Overall sentiment (bullish/bearish/neutral) with evidence
3. Top 3 actionable insights or things to watch

Be analytical, not just descriptive. Use headings and bullet points.`;

  const res = await ollama.chat({
    model: 'gemma2:27b',
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0.3 },
  });

  return res.message.content;
}

export async function embedForJob(text: string): Promise<number[]> {
  const res = await ollama.embed({ model: 'nomic-embed-text', input: text.slice(0, 2000) });
  return res.embeddings[0];
}
```

- [ ] **Step 4: Implement apps/job/src/report.ts**

```typescript
import { getConnection, oracledb } from '@daily/db';

export async function saveReport(topicId: number, content: string): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number]>(
      `INSERT INTO daily_reports (topic_id, content)
       VALUES (:tid, :content)
       RETURNING id INTO :id`,
      {
        tid: topicId,
        content,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      } as Record<string, unknown>,
      { autoCommit: true },
    );
    return (result.outBinds as { id: number[] }).id[0];
  } finally {
    await conn.close();
  }
}

export async function markSent(reportId: number): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE daily_reports SET sent_at = SYSTIMESTAMP WHERE id = :id`,
      { id: reportId },
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @daily/job test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/job/src/
git commit -m "feat: job — Ollama analysis + report persistence"
```

---

### Task 10: Email + cron scheduler

**Files:**
- Create: `apps/job/src/email.ts`
- Create: `apps/job/src/index.ts`

- [ ] **Step 1: Implement apps/job/src/email.ts**

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.ORACLE_SMTP_HOST!,
  port: Number(process.env.ORACLE_SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.ORACLE_SMTP_USER!,
    pass: process.env.ORACLE_SMTP_PASS!,
  },
});

export async function sendReport(opts: {
  to: string;
  keyword: string;
  content: string;
}): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  await transporter.sendMail({
    from: process.env.SMTP_FROM!,
    to: opts.to,
    subject: `[Daily Report] ${opts.keyword} — ${date}`,
    text: opts.content,
    html: `<pre style="font-family:monospace;white-space:pre-wrap">${opts.content}</pre>`,
  });
}
```

- [ ] **Step 2: Implement apps/job/src/index.ts**

```typescript
import cron from 'node-cron';
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';
import { embedForJob } from './analyze.js';
import { retrieveContext } from './rag.js';
import { analyzeWithOllama } from './analyze.js';
import { saveReport, markSent } from './report.js';
import { sendReport } from './email.js';

async function runJobForTopic(topic: Topic): Promise<void> {
  console.log(`[job] starting topic=${topic.id} "${topic.keyword}"`);

  const queryEmbedding = await embedForJob(topic.keyword);
  const passages = await retrieveContext(topic.id, queryEmbedding);

  if (passages.length === 0) {
    console.log(`[job] no data for topic=${topic.id}, skipping`);
    return;
  }

  const content = await analyzeWithOllama(topic.keyword, passages);
  const reportId = await saveReport(topic.id, content);

  await sendReport({ to: topic.email, keyword: topic.keyword, content });
  await markSent(reportId);

  console.log(`[job] topic=${topic.id} report sent → ${topic.email}`);
}

async function loadTopics(): Promise<Topic[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, string, number]>(
      `SELECT id, keyword, email, cron_time, active FROM topics WHERE active = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, keyword, email, cronTime, active]) => ({
      id, keyword, email, cronTime, active, createdAt: new Date(),
    }));
  } finally {
    await conn.close();
  }
}

async function main(): Promise<void> {
  await initPool();
  const topics = await loadTopics();

  for (const topic of topics) {
    cron.schedule(topic.cronTime, () => {
      runJobForTopic(topic).catch(console.error);
    });
    console.log(`[job] scheduled topic=${topic.id} at "${topic.cronTime}"`);
  }

  // Re-load schedule daily at midnight to pick up new topics
  cron.schedule('0 0 * * *', async () => {
    console.log('[job] reloading topic schedules...');
    // Restart process cleanly to re-register crons
    process.exit(0);
  });
}

main().catch(console.error);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @daily/job typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/job/
git commit -m "feat: job — email sender + cron scheduler"
```

---

## Phase 4: Archivist

### Task 11: apps/archivist — summarize + purge + cron

**Files:**
- Create: `apps/archivist/package.json`
- Create: `apps/archivist/tsconfig.json`
- Create: `apps/archivist/vitest.config.ts`
- Create: `apps/archivist/src/summarize.ts`
- Create: `apps/archivist/src/purge.ts`
- Create: `apps/archivist/src/index.ts`
- Create: `apps/archivist/src/__tests__/purge.test.ts`

- [ ] **Step 1: Create apps/archivist/package.json**

```json
{
  "name": "@daily/archivist",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@daily/db": "workspace:*",
    "ollama": "^0.5.0",
    "node-cron": "^3.0.3",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create apps/archivist/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "paths": { "@daily/db": ["../../packages/db/src/index.ts"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/archivist/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', globals: true } });
```

- [ ] **Step 4: Write failing test**

Create `apps/archivist/src/__tests__/purge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 5 });
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('@daily/db', () => ({
  getConnection: vi.fn().mockResolvedValue({ execute: mockExecute, close: mockClose }),
  oracledb: {},
}));

import { purgeYesterdayRawData, nullOldReportContent } from '../purge.js';

describe('purgeYesterdayRawData', () => {
  it('deletes yesterday raw_data rows', async () => {
    const count = await purgeYesterdayRawData();
    expect(count).toBe(5);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM raw_data'),
      expect.any(Object),
      expect.any(Object),
    );
  });
});

describe('nullOldReportContent', () => {
  it('nulls content older than 90 days', async () => {
    await nullOldReportContent();
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE daily_reports'),
      expect.any(Object),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 5: Run test — expect FAIL**

```bash
pnpm --filter @daily/archivist test
```

Expected: FAIL — `Cannot find module '../purge.js'`

- [ ] **Step 6: Implement apps/archivist/src/purge.ts**

```typescript
import { getConnection } from '@daily/db';

export async function purgeYesterdayRawData(): Promise<number> {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `DELETE FROM raw_data WHERE TRUNC(created_at) = TRUNC(SYSTIMESTAMP - 1)`,
      {},
      { autoCommit: true },
    );
    return result.rowsAffected ?? 0;
  } finally {
    await conn.close();
  }
}

export async function nullOldReportContent(): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE daily_reports
       SET content = NULL
       WHERE content IS NOT NULL
         AND created_at < SYSTIMESTAMP - INTERVAL '90' DAY`,
      {},
      { autoCommit: true },
    );
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 7: Run test — expect PASS**

```bash
pnpm --filter @daily/archivist test
```

Expected: PASS

- [ ] **Step 8: Implement apps/archivist/src/summarize.ts**

```typescript
import { Ollama } from 'ollama';
import { getConnection, oracledb } from '@daily/db';

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? 'http://localhost:11434' });

interface RawRow {
  ID: number;
  TOPIC_ID: number;
  SOURCE: string;
  URL: string | null;
  TITLE: string;
  BODY: string;
}

interface TopicSummary {
  topicId: number;
  rank: number;
  source: string;
  url: string | null;
  title: string;
  summary: string;
  sentiment: number;
}

export async function summariseYesterday(): Promise<void> {
  const conn = await getConnection();
  const rows = await conn.execute<RawRow>(
    `SELECT id, topic_id, source, url, title, body
     FROM raw_data
     WHERE TRUNC(created_at) = TRUNC(SYSTIMESTAMP - 1)
     ORDER BY topic_id`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  await conn.close();

  const byTopic = new Map<number, RawRow[]>();
  for (const row of rows.rows ?? []) {
    const list = byTopic.get(row.TOPIC_ID) ?? [];
    list.push(row);
    byTopic.set(row.TOPIC_ID, list);
  }

  for (const [topicId, items] of byTopic) {
    const summaries = await rankAndSummarise(topicId, items);
    await insertSummaries(summaries);
  }
}

async function rankAndSummarise(topicId: number, items: RawRow[]): Promise<TopicSummary[]> {
  const itemList = items
    .slice(0, 50) // send max 50 to LLM
    .map((r, i) => `[${i + 1}] ${r.TITLE}\n${r.BODY?.slice(0, 300) ?? ''}`)
    .join('\n\n');

  const prompt = `You are a news editor. From the items below, select the TOP 10 most important and unique ones.
For each selected item output a JSON array with fields:
- index (1-based original index)
- summary (one sentence, max 200 chars)
- sentiment (number -1.0 to 1.0)

Return ONLY valid JSON array, no other text.

Items:
${itemList}`;

  const res = await ollama.chat({
    model: 'gemma2:27b',
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0 },
  });

  let parsed: Array<{ index: number; summary: string; sentiment: number }> = [];
  try {
    parsed = JSON.parse(res.message.content);
  } catch {
    // LLM returned malformed JSON — skip this topic
    return [];
  }

  return parsed.slice(0, 10).map((p, i) => {
    const original = items[p.index - 1];
    return {
      topicId,
      rank: i + 1,
      source: original?.SOURCE ?? 'news',
      url: original?.URL ?? null,
      title: original?.TITLE ?? '',
      summary: p.summary,
      sentiment: p.sentiment,
    };
  });
}

async function insertSummaries(summaries: TopicSummary[]): Promise<void> {
  if (summaries.length === 0) return;
  const conn = await getConnection();
  try {
    for (const s of summaries) {
      await conn.execute(
        `INSERT INTO archived_summary (topic_id, report_date, rank, source, url, title, summary, sentiment)
         VALUES (:tid, TRUNC(SYSTIMESTAMP - 1), :rank, :src, :url, :title, :summary, :sentiment)`,
        { tid: s.topicId, rank: s.rank, src: s.source, url: s.url, title: s.title, summary: s.summary, sentiment: s.sentiment },
        { autoCommit: true },
      );
    }
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 9: Implement apps/archivist/src/index.ts**

```typescript
import cron from 'node-cron';
import { initPool } from '@daily/db';
import { summariseYesterday } from './summarize.js';
import { purgeYesterdayRawData, nullOldReportContent } from './purge.js';

async function runArchivist(): Promise<void> {
  console.log('[archivist] starting daily archive run...');

  await summariseYesterday();
  console.log('[archivist] summaries written');

  const deleted = await purgeYesterdayRawData();
  console.log(`[archivist] purged ${deleted} raw_data rows`);

  await nullOldReportContent();
  console.log('[archivist] nulled old report content');
}

async function main(): Promise<void> {
  await initPool();
  cron.schedule('0 3 * * *', () => {
    runArchivist().catch(console.error);
  });
  console.log('[archivist] started — runs daily at 03:00');
}

main().catch(console.error);
```

- [ ] **Step 10: Typecheck**

```bash
pnpm --filter @daily/archivist typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/archivist/
git commit -m "feat: archivist — LLM top-10 summarise, purge, report retention"
```

---

## Phase 5: Web App

### Task 12: Next.js scaffold + Auth.js Google OAuth

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/src/auth.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@daily/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@daily/db": "workspace:*",
    "next": "^15.3.0",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.3.0"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@daily/db": ["../../packages/db/src/index.ts"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@daily/db'],
  output: 'standalone',
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/src/auth.ts**

```typescript
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean),
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      return ADMIN_EMAILS.has(profile?.email ?? '');
    },
  },
  pages: { signIn: '/login' },
});
```

- [ ] **Step 5: Create apps/web/src/middleware.ts**

```typescript
import { auth } from '@/auth';

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== '/login') {
    return Response.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Create apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Daily Report' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create apps/web/src/app/page.tsx** (redirect to /topics)

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/topics');
}
```

- [ ] **Step 8: Create login page `apps/web/src/app/login/page.tsx`**

```tsx
import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <main style={{ marginTop: '4rem', textAlign: 'center' }}>
      <h1>Daily Report</h1>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/topics' });
        }}
      >
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 9: Create Auth.js API route `apps/web/src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 10: Install deps and verify build**

```bash
pnpm install
pnpm --filter @daily/web typecheck
```

Expected: no type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/
git commit -m "feat: web — Next.js scaffold + Auth.js Google OAuth"
```

---

### Task 13: Topics CRUD

**Files:**
- Create: `apps/web/src/lib/queries.ts`
- Create: `apps/web/src/app/topics/actions.ts`
- Create: `apps/web/src/app/topics/page.tsx`

- [ ] **Step 1: Create apps/web/src/lib/queries.ts**

```typescript
import { initPool, getConnection, oracledb } from '@daily/db';
import type { Topic } from '@daily/db';

export async function getTopics(): Promise<Topic[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, string, string, string, number, Date]>(
      `SELECT id, keyword, email, cron_time, active, created_at FROM topics ORDER BY id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, keyword, email, cronTime, active, createdAt]) => ({
      id, keyword, email, cronTime, active, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getTodayCount(): Promise<Record<number, number>> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[number, number]>(
      `SELECT topic_id, COUNT(*) FROM raw_data
       WHERE TRUNC(created_at) = TRUNC(SYSTIMESTAMP)
       GROUP BY topic_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return Object.fromEntries((result.rows ?? []).map(([tid, cnt]) => [tid, cnt]));
  } finally {
    await conn.close();
  }
}

export async function getReports(page: number, limit = 20): Promise<{ id: number; topicId: number; keyword: string; sentAt: Date | null; createdAt: Date }[]> {
  await initPool();
  const conn = await getConnection();
  try {
    const offset = (page - 1) * limit;
    const result = await conn.execute<[number, number, string, Date | null, Date]>(
      `SELECT r.id, r.topic_id, t.keyword, r.sent_at, r.created_at
       FROM daily_reports r JOIN topics t ON r.topic_id = t.id
       ORDER BY r.created_at DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { offset, limit },
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return (result.rows ?? []).map(([id, topicId, keyword, sentAt, createdAt]) => ({
      id, topicId, keyword, sentAt, createdAt,
    }));
  } finally {
    await conn.close();
  }
}

export async function getReportContent(id: number): Promise<string | null> {
  await initPool();
  const conn = await getConnection();
  try {
    const result = await conn.execute<[string | null]>(
      `SELECT content FROM daily_reports WHERE id = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_ARRAY },
    );
    return result.rows?.[0]?.[0] ?? null;
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 2: Create apps/web/src/app/topics/actions.ts**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { initPool, getConnection } from '@daily/db';

export async function createTopic(formData: FormData): Promise<void> {
  const keyword = String(formData.get('keyword')).trim();
  const email = String(formData.get('email')).trim();
  const cronTime = String(formData.get('cronTime')).trim();

  if (!keyword || !email || !cronTime) throw new Error('All fields required');

  await initPool();
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO topics (keyword, email, cron_time) VALUES (:keyword, :email, :cronTime)`,
      { keyword, email, cronTime },
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
```

- [ ] **Step 3: Create apps/web/src/app/topics/page.tsx**

```tsx
import { getTopics } from '@/lib/queries';
import { createTopic, toggleTopic, deleteTopic } from './actions';

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <main>
      <h1>Topics</h1>

      <form action={createTopic} style={{ marginBottom: '2rem', display: 'grid', gap: '0.5rem', maxWidth: 400 }}>
        <input name="keyword" placeholder="Keyword (e.g. oil price)" required />
        <input name="email" type="email" placeholder="Report email" required />
        <input name="cronTime" placeholder='Cron time (e.g. "0 7 * * *")' required />
        <button type="submit">Add Topic</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Keyword</th>
            <th>Email</th>
            <th>Schedule</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id}>
              <td>{t.keyword}</td>
              <td>{t.email}</td>
              <td><code>{t.cronTime}</code></td>
              <td>{t.active ? '✓' : '—'}</td>
              <td>
                <form action={toggleTopic.bind(null, t.id, t.active)} style={{ display: 'inline' }}>
                  <button type="submit">{t.active ? 'Pause' : 'Resume'}</button>
                </form>
                {' '}
                <form action={deleteTopic.bind(null, t.id)} style={{ display: 'inline' }}>
                  <button type="submit">Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @daily/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/
git commit -m "feat: web — topics CRUD (list, create, toggle, delete)"
```

---

### Task 14: Dashboard + Reports pages

**Files:**
- Create: `apps/web/src/app/dashboard/page.tsx`
- Create: `apps/web/src/app/reports/page.tsx`

- [ ] **Step 1: Create apps/web/src/app/dashboard/page.tsx**

```tsx
import { getTopics, getTodayCount } from '@/lib/queries';

export const revalidate = 300; // refresh every 5 min

export default async function DashboardPage() {
  const [topics, counts] = await Promise.all([getTopics(), getTodayCount()]);

  return (
    <main>
      <h1>Dashboard — Today&apos;s Collection</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Topic</th>
            <th>Items collected today</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id}>
              <td>{t.keyword}</td>
              <td style={{ textAlign: 'center' }}>{counts[t.id] ?? 0}</td>
              <td>{t.active ? '🟢 active' : '⏸ paused'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 2: Create apps/web/src/app/reports/page.tsx**

```tsx
import { getReports, getReportContent } from '@/lib/queries';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string }>;
}) {
  const { page = '1', id } = await searchParams;
  const reports = await getReports(Number(page));
  const selectedContent = id ? await getReportContent(Number(id)) : null;

  return (
    <main>
      <h1>Past Reports</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem' }}>
        <div>
          {reports.map((r) => (
            <div key={r.id} style={{ marginBottom: '0.5rem' }}>
              <a href={`/reports?id=${r.id}`}>
                <strong>{r.keyword}</strong>
                <br />
                <small>{r.createdAt.toLocaleDateString()}</small>
                {r.sentAt && <small> ✓ sent</small>}
              </a>
            </div>
          ))}
          <div style={{ marginTop: '1rem' }}>
            {Number(page) > 1 && <a href={`/reports?page=${Number(page) - 1}`}>← prev</a>}
            {' '}
            {reports.length === 20 && <a href={`/reports?page=${Number(page) + 1}`}>next →</a>}
          </div>
        </div>
        <div>
          {selectedContent ? (
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '1rem' }}>
              {selectedContent}
            </pre>
          ) : (
            <p>Select a report to view its content.</p>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add nav to layout**

Update `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Daily Report' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
        <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
          <a href="/topics">Topics</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/reports">Reports</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck and verify**

```bash
pnpm --filter @daily/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat: web — dashboard + reports pages"
```

---

## Phase 6: Docker & CI/CD

### Task 15: Dockerfiles

**Files:**
- Create: `docker/web.Dockerfile`
- Create: `docker/crawler.Dockerfile`
- Create: `docker/job.Dockerfile`
- Create: `docker/archivist.Dockerfile`

- [ ] **Step 1: Create docker/web.Dockerfile**

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_BUILD_ID=local
RUN pnpm --filter @daily/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 2: Create docker/crawler.Dockerfile**

```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/crawler/package.json ./apps/crawler/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/crawler/src ./apps/crawler/src

CMD ["pnpm", "--filter", "@daily/crawler", "start"]
```

- [ ] **Step 3: Create docker/job.Dockerfile**

```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/job/package.json ./apps/job/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/job/src ./apps/job/src

CMD ["pnpm", "--filter", "@daily/job", "start"]
```

- [ ] **Step 4: Create docker/archivist.Dockerfile**

```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/archivist/package.json ./apps/archivist/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/archivist/src ./apps/archivist/src

CMD ["pnpm", "--filter", "@daily/archivist", "start"]
```

- [ ] **Step 5: Commit**

```bash
git add docker/
git commit -m "feat: Dockerfiles for all 4 apps"
```

---

### Task 16: docker-compose.yml + Caddy

**Files:**
- Modify: `docker/docker-compose.yml` (replace stub)
- Create: `docker/Caddyfile`

- [ ] **Step 1: Replace docker/docker-compose.yml with full version**

```yaml
# daily-report — Docker Compose
#
# Profiles:
#   (default) — caddy + web + crawler + job + archivist
#   tools     — one-shot Flyway migrate / info / validate

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      PUBLIC_HOST: "${PUBLIC_HOST}"
    depends_on:
      web:
        condition: service_healthy
    mem_limit: 128m

  web:
    build:
      context: ../
      dockerfile: ./docker/web.Dockerfile
    restart: unless-stopped
    env_file: ../.env
    environment:
      ORACLE_WALLET_DIR: /wallet
    volumes:
      - ../wallet:/wallet:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('net').connect({host:'127.0.0.1',port:3000}).on('connect',function(){this.end();process.exit(0)}).on('error',function(){process.exit(1)})\""]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 60s
    mem_limit: 512m

  crawler:
    build:
      context: ../
      dockerfile: ./docker/crawler.Dockerfile
    restart: unless-stopped
    env_file: ../.env
    environment:
      ORACLE_WALLET_DIR: /wallet
      OLLAMA_URL: http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ../wallet:/wallet:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e 'process.exit(0)'"]
      interval: 60s
      timeout: 5s
      retries: 3
      start_period: 15s
    mem_limit: 256m

  job:
    build:
      context: ../
      dockerfile: ./docker/job.Dockerfile
    restart: unless-stopped
    env_file: ../.env
    environment:
      ORACLE_WALLET_DIR: /wallet
      OLLAMA_URL: http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ../wallet:/wallet:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e 'process.exit(0)'"]
      interval: 60s
      timeout: 5s
      retries: 3
      start_period: 15s
    mem_limit: 4096m

  archivist:
    build:
      context: ../
      dockerfile: ./docker/archivist.Dockerfile
    restart: unless-stopped
    env_file: ../.env
    environment:
      ORACLE_WALLET_DIR: /wallet
      OLLAMA_URL: http://host.docker.internal:11434
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ../wallet:/wallet:ro
    healthcheck:
      test: ["CMD-SHELL", "node -e 'process.exit(0)'"]
      interval: 60s
      timeout: 5s
      retries: 3
      start_period: 15s
    mem_limit: 4096m

  flyway:
    image: flyway/flyway:10-alpine
    profiles: ["tools"]
    environment:
      FLYWAY_URL: "jdbc:oracle:thin:@${ORACLE_TNS_NAME}?TNS_ADMIN=${ORACLE_WALLET_DIR}"
      FLYWAY_USER: "${ORACLE_SCHEMA}"
      FLYWAY_PASSWORD: "${ORACLE_SCHEMA_PASSWORD}"
    volumes:
      - ../db/migrations:/flyway/sql:ro
      - ../db/flyway.conf:/flyway/conf/flyway.conf:ro
      - ../wallet:/wallet:ro
    command: ["-configFiles=/flyway/conf/flyway.conf", "info"]

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: Create docker/Caddyfile**

```caddyfile
{$PUBLIC_HOST} {
  reverse_proxy web:3000
  encode gzip
}
```

- [ ] **Step 3: Commit**

```bash
git add docker/
git commit -m "feat: docker-compose.yml (full) + Caddyfile"
```

---

### Task 17: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create .github/workflows/deploy.yml**

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch: {}

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - uses: actions/checkout@v4

      - name: Configure SSH
        env:
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          set -e
          if [ -z "${DEPLOY_HOST:-}" ]; then echo "::error::DEPLOY_HOST secret is empty"; exit 1; fi
          if [ -z "${DEPLOY_SSH_KEY:-}" ]; then echo "::error::DEPLOY_SSH_KEY secret is empty"; exit 1; fi

          mkdir -p ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy
          chmod 600 ~/.ssh/deploy

          if ! grep -q -- '-----BEGIN' ~/.ssh/deploy; then
            echo "::error::DEPLOY_SSH_KEY does not look like a PEM private key"
            exit 1
          fi

          echo "Runner public IP: $(curl -fsS https://api.ipify.org || echo unknown)"
          nc -vz -w 5 "$DEPLOY_HOST" 22 2>&1 | sed 's/^/  /' || true

          if ! ssh-keyscan -T 15 "$DEPLOY_HOST" >> ~/.ssh/known_hosts 2>/tmp/keyscan.err; then
            echo "::error::ssh-keyscan failed"; cat /tmp/keyscan.err; exit 1
          fi

      - name: Build .env
        run: |
          cat > .env <<EOF
          PUBLIC_IP=${{ secrets.PUBLIC_IP }}
          PUBLIC_HOST=${{ secrets.PUBLIC_HOST }}

          ORACLE_USER=${{ secrets.ORACLE_USER }}
          ORACLE_PASSWORD=${{ secrets.ORACLE_PASSWORD }}
          ORACLE_TNS_NAME=${{ secrets.ORACLE_TNS_NAME }}
          ORACLE_SCHEMA=${{ secrets.ORACLE_SCHEMA }}
          ORACLE_SCHEMA_PASSWORD=${{ secrets.ORACLE_SCHEMA_PASSWORD }}
          ORACLE_WALLET_DIR=/wallet
          ORACLE_WALLET_PASSWORD=${{ secrets.ORACLE_WALLET_PASSWORD }}

          OLLAMA_URL=http://host.docker.internal:11434

          ORACLE_SMTP_HOST=${{ secrets.ORACLE_SMTP_HOST }}
          ORACLE_SMTP_PORT=587
          ORACLE_SMTP_USER=${{ secrets.ORACLE_SMTP_USER }}
          ORACLE_SMTP_PASS=${{ secrets.ORACLE_SMTP_PASS }}
          SMTP_FROM=${{ secrets.SMTP_FROM }}

          REDDIT_CLIENT_ID=${{ secrets.REDDIT_CLIENT_ID }}
          REDDIT_CLIENT_SECRET=${{ secrets.REDDIT_CLIENT_SECRET }}
          REDDIT_USERNAME=${{ secrets.REDDIT_USERNAME }}
          REDDIT_PASSWORD=${{ secrets.REDDIT_PASSWORD }}

          TWITTER_USERNAME=${{ secrets.TWITTER_USERNAME }}
          TWITTER_PASSWORD=${{ secrets.TWITTER_PASSWORD }}

          AUTH_SECRET=${{ secrets.AUTH_SECRET }}
          AUTH_GOOGLE_ID=${{ secrets.AUTH_GOOGLE_ID }}
          AUTH_GOOGLE_SECRET=${{ secrets.AUTH_GOOGLE_SECRET }}
          AUTH_TRUST_HOST=true
          AUTH_URL=https://${{ secrets.PUBLIC_HOST }}
          ADMIN_EMAILS=${{ secrets.ADMIN_EMAILS }}
          EOF

      - name: Sync to VM
        env:
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          rsync -az --delete \
            --exclude='.git/' \
            --exclude='node_modules/' \
            --exclude='**/node_modules/' \
            --exclude='.next/' \
            --exclude='**/.next/' \
            --exclude='wallet/' \
            --exclude='data/' \
            -e "ssh -i ~/.ssh/deploy" \
            ./ "$DEPLOY_USER@$DEPLOY_HOST:/opt/daily-report/"

          ssh -i ~/.ssh/deploy "$DEPLOY_USER@$DEPLOY_HOST" \
            "chmod 600 /opt/daily-report/.env && chmod +x /opt/daily-report/scripts/dc"

      - name: Build & restart
        env:
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          ssh -i ~/.ssh/deploy "$DEPLOY_USER@$DEPLOY_HOST" "set -euo pipefail
            cd /opt/daily-report
            ./scripts/dc up -d --build --remove-orphans
            ./scripts/dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile \
              || ./scripts/dc restart caddy
            docker image prune -f
          "

      - name: Health check
        env:
          PUBLIC_HOST: ${{ secrets.PUBLIC_HOST }}
        run: |
          for i in 1 2 3 4 5; do
            if curl -fsS --max-time 10 "https://${PUBLIC_HOST}/" >/dev/null; then
              echo "✓ healthy"; exit 0
            fi
            sleep 8
          done
          echo "::warning::homepage did not respond within 40s"
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: GitHub Actions CI/CD — rsync + SSH deploy"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| pnpm monorepo, share-pad pattern | Task 1 |
| Oracle 23ai wallet connection pool | Task 2 |
| Flyway V1 (schema) + V2 (vector index) | Task 3 |
| Crawler: RSS + Yahoo Finance news | Task 4 |
| Crawler: Reddit | Task 5 |
| Crawler: Twitter/X | Task 6 |
| Crawler: embedding + store + dedup + cron | Task 7 |
| Job: Oracle Vector Search RAG | Task 8 |
| Job: Ollama analysis + report persistence | Task 9 |
| Job: OCI SMTP email + per-topic cron | Task 10 |
| Archivist: LLM top-10 summarise + purge + 90-day retention | Task 11 |
| Web: Next.js + Auth.js Google OAuth | Task 12 |
| Web: Topics CRUD | Task 13 |
| Web: Dashboard + Reports | Task 14 |
| Dockerfiles (all 4 apps) | Task 15 |
| docker-compose full + Caddy | Task 16 |
| GitHub Actions CI/CD | Task 17 |
| Flyway never runs in CI | Task 17 (CI has no flyway step) ✓ |
| ORACLE_USER / ORACLE_SCHEMA var names | Tasks 2, 3, 16, 17 ✓ |
| host.docker.internal for Ollama | Task 16 ✓ |
| 2GB storage discipline (no long-lived embeddings) | Task 11 (archivist purges raw_data daily) ✓ |
