# Daily Report — Design Spec

**Date:** 2026-05-13
**Status:** Approved (revised 2026-05-13 after plan review — see `docs/superpowers/reviews/2026-05-13-plan-review.md`)

---

## 1. Overview

A personal stock & social sentiment daily report system running on OCI Ampere A1 (4 vCPU, 24GB RAM). Collects social/news data per user-defined topic, runs local LLM analysis via Ollama, and sends a daily email report. Oracle 23ai Free is the database; storage is kept well under the 2GB free tier limit through daily cleanup.

---

## 2. Monorepo Structure

pnpm monorepo modeled after the share-pad project.

```
daily-report/
├── apps/
│   ├── web/          # Next.js 16 — Topic Manager UI, Auth.js Google OAuth
│   ├── crawler/      # Node.js cron — Reddit + Twitter/X + News collection
│   ├── job/          # Node.js cron — Ollama RAG analysis + OCI SMTP email
│   └── archivist/    # Node.js cron — DB cleanup and summarization
├── packages/
│   └── db/           # Shared oracledb connection pool + types
├── db/
│   ├── flyway.conf
│   └── migrations/
│       ├── V1__initial_schema.sql
│       └── V2__vector_index.sql
├── docker/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   ├── web.Dockerfile
│   ├── crawler.Dockerfile
│   ├── job.Dockerfile
│   └── archivist.Dockerfile
├── .github/workflows/deploy.yml
├── wallet/             # gitignored — exists only on OCI host
├── scripts/dc
├── .env / .env.example
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**Language:** TypeScript throughout (all apps and packages).

---

## 3. Database Schema (Oracle 23ai Free)

Two Oracle users:
- `ORACLE_USER` — runtime app user (DML only: SELECT, INSERT, UPDATE, DELETE)
- `ORACLE_SCHEMA` — schema owner (DDL rights, Flyway migration target)

Migrations are run **manually from the terminal** via `pnpm db:migrate`. CI never runs Flyway.

### Tables

```sql
-- User-defined topics with notification settings
TOPICS (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword     VARCHAR2(500)  NOT NULL,
  email       VARCHAR2(255)  NOT NULL,
  cron_time   VARCHAR2(50)   NOT NULL,   -- e.g. "0 7 * * *"
  active      NUMBER(1)      DEFAULT 1,
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP
)

-- Daily crawl buffer — purged every day by archivist
RAW_DATA (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    NUMBER         REFERENCES TOPICS(id),
  source      VARCHAR2(50)   NOT NULL,   -- 'reddit' | 'twitter' | 'news'
  url         VARCHAR2(2000),
  title       VARCHAR2(1000),
  body        CLOB,
  embedding   VECTOR(768, FLOAT32),      -- Oracle 23ai native vector type
  sentiment   NUMBER(3,2),               -- -1.0 to 1.0
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP
)

-- LLM-generated reports (content purged after 90 days, metadata kept)
DAILY_REPORTS (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    NUMBER         REFERENCES TOPICS(id),
  content     CLOB,                      -- Markdown; nulled after 90 days
  sent_at     TIMESTAMP,
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP
)

-- Top-10 summaries per topic per day (permanent, lightweight)
ARCHIVED_SUMMARY (
  id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id    NUMBER         REFERENCES TOPICS(id),
  report_date DATE           NOT NULL,
  rank        NUMBER(2)      NOT NULL,   -- 1–10
  source      VARCHAR2(50)   NOT NULL,
  url         VARCHAR2(2000),
  title       VARCHAR2(1000),
  summary     VARCHAR2(1000),
  sentiment   NUMBER(3,2),
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP
)
```

### Storage Estimate (5 topics, 1 year)

| Table | Daily | Annual |
|---|---|---|
| RAW_DATA | ~6.5MB peak, cleared daily | ~6.5MB max at any time |
| ARCHIVED_SUMMARY | ~50KB | ~18MB |
| DAILY_REPORTS | ~100KB | ~36MB (content nulled after 90d) |
| **Total** | | **~60MB** — well within 2GB free tier |

---

## 4. Components

### apps/crawler

- **Schedule:** hourly cron per active topic
- **Reddit:** public `.json` endpoint via `fetch` — no OAuth app needed (Reddit's 2024 Responsible Builder Policy gate is bypassed). Identified by unique `REDDIT_USER_AGENT`.
- **Twitter/X:** `agent-twitter-client` — unofficial TypeScript scraper
- **News:** `rss-parser` + `yahoo-finance2`
- **Embedding:** Ollama `nomic-embed-text` model via HTTP → stored in `RAW_DATA.embedding`
- **Dedup:** skip rows where `url` already exists for the same `topic_id` + date

### apps/job

- **Schedule:** per-topic `cron_time` from `TOPICS` table
- **RAG:** Oracle Vector Search (`VECTOR_DISTANCE`) to retrieve relevant `RAW_DATA` for the topic
- **LLM:** Ollama HTTP API (`http://host.docker.internal:11434`) → Gemma 2 9B (Q4_K_M, ~6 GB resident)
- **Output:** Markdown report saved to `DAILY_REPORTS`
- **Email:** Nodemailer + OCI SMTP relay → sent to `TOPICS.email`

### apps/archivist

- **Schedule:** daily at 03:00
- **Step 1 — Summarize:** For yesterday's `RAW_DATA`, grouped by `topic_id`, ask Ollama to rank and summarize top 10 most important items → insert into `ARCHIVED_SUMMARY`
- **Step 2 — Purge raw:** Delete all yesterday's `RAW_DATA` rows (body, embedding, everything)
- **Step 3 — Report retention:** Null `DAILY_REPORTS.content` for reports older than 90 days

### apps/web

- **Framework:** Next.js 16 (App Router)
- **Auth:** Auth.js v5 — Google OAuth, admin whitelist via `ADMIN_EMAILS`
- **Pages:**
  - `/topics` — CRUD for topics (keyword, email, cron_time, active toggle)
  - `/dashboard` — live count of today's collected items per topic
  - `/reports` — paginated list of past `DAILY_REPORTS` with content viewer
- **Reverse proxy:** Caddy terminates TLS, proxies to `web:3000`

### packages/db

- Shared `oracledb` connection pool factory
- `ORACLE_SCHEMA` sets `CURRENT_SCHEMA` so unqualified table names resolve correctly
- Oracle Wallet path from `ORACLE_WALLET_DIR` env var

---

## 5. Ollama Integration

Ollama runs directly on the OCI host (already installed). Docker containers reach it via `host.docker.internal`:

```yaml
# docker-compose.yml
services:
  crawler:
    extra_hosts:
      - "host.docker.internal:host-gateway"
  job:
    extra_hosts:
      - "host.docker.internal:host-gateway"
  archivist:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

`OLLAMA_URL=http://host.docker.internal:11434` in `.env`.

Models used:
- `nomic-embed-text` — embeddings (crawler)
- `gemma2:9b` — analysis and summarization (job, archivist)

**Hardware note (Ampere A1, 4 OCPU / 24 GB / no GPU):** `gemma2:27b` Q4_K_M needs ~16.65 GB resident and decodes at 1–2 tok/s on this CPU, which makes a daily-report cycle take ~20 min per topic. `gemma2:9b` Q4_K_M is ~6 GB and decodes at ~3–5 tok/s, putting a topic at 2–4 min. With containers already claiming ~7 GB (after the `job`/`archivist` `mem_limit` reductions noted in §6), this leaves ~10 GB headroom for the model + KV cache.

**Ollama tuning on host (set in the systemd unit or `~/.ollama/config`):**
- `OLLAMA_NUM_PARALLEL=1` — single in-flight request; concurrent inference on 4 ARM cores thrashes the KV cache.
- `OLLAMA_MAX_LOADED_MODELS=1` — keep only one model resident at a time.
- `OLLAMA_KEEP_ALIVE=24h` — avoid unload/reload between cron ticks.

Per-topic and archivist runs should be serialized at the application layer (cron expressions spaced apart, archivist always at a quiet hour).

---

## 6. CI/CD

Pattern identical to share-pad.

- **Trigger:** push to `main`, or manual `workflow_dispatch`
- **Runner:** `ubuntu-latest` (GitHub-hosted)
- **Steps:**
  1. Configure SSH from `DEPLOY_SSH_KEY` secret
  2. Build `.env` from GitHub Secrets on the runner
  3. `rsync` source to `/opt/daily-report/` on OCI host (excludes `wallet/`, `node_modules/`, `.next/`, `data/`)
  4. SSH: `docker compose up -d --build --remove-orphans` + `caddy reload`
  5. Health check: `https://{PUBLIC_HOST}/` — 5 retries, 8s apart
- **Flyway:** never run from CI. Deploy user has DML rights only, no DDL.

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `DEPLOY_SSH_KEY` | PEM private key for OCI deploy user |
| `DEPLOY_HOST` | OCI public IP |
| `DEPLOY_USER` | SSH username |
| `PUBLIC_HOST` | Domain name |
| `PUBLIC_IP` | OCI public IP |
| `ORACLE_USER` | App runtime DB user |
| `ORACLE_PASSWORD` | App runtime DB password |
| `ORACLE_TNS_NAME` | TNS alias from tnsnames.ora |
| `ORACLE_SCHEMA` | Schema owner name |
| `ORACLE_WALLET_PASSWORD` | Wallet password |
| `AUTH_SECRET` | Auth.js secret |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `ADMIN_EMAILS` | Comma-separated admin email whitelist |
| `ORACLE_SMTP_HOST` | OCI SMTP relay host |
| `ORACLE_SMTP_USER` | OCI SMTP username |
| `ORACLE_SMTP_PASS` | OCI SMTP password |
| `OLLAMA_URL` | `http://host.docker.internal:11434` |

---

## 7. Local Development

```bash
pnpm install
cp .env.example .env   # fill in credentials

# DB migrations (manual, terminal only)
pnpm db:migrate        # flyway migrate
pnpm db:info           # flyway info
pnpm db:validate       # flyway validate
pnpm db:repair         # flyway repair
# Rollback: write a new V*__rollback_xxx.sql and run db:migrate (Flyway Community has no undo)

# Run apps individually
pnpm dev:web
pnpm dev:crawler
pnpm dev:job
pnpm dev:archivist

# Docker (production-like)
pnpm dc up -d --build
```

---

## 8. Phase Plan

| Phase | Scope |
|---|---|
| 1 | Repo scaffold + DB schema (Flyway V1, V2) + packages/db |
| 2 | apps/crawler — Reddit + News (Twitter/X added later) |
| 3 | apps/job — Ollama RAG + email |
| 4 | apps/archivist — daily cleanup + report retention |
| 5 | apps/web — Topic Manager UI + Auth.js |
| 6 | Docker compose + Caddy + CI/CD |
