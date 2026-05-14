# daily-report

Personal daily-report system. Crawls HackerNews + curated tech/macro RSS feeds (including subreddit RSS) for user-defined themes, runs theme-aware LLM analysis on Oracle 23ai vector RAG, and emails one report per theme every morning.

Runs on OCI Always Free Ampere A1 (4 OCPU, 24 GB RAM) via Docker Compose, Caddy, and rsync-based GitHub Actions deploy. Same infra pattern as `~/Documents/workspace/share-pad`.

Live: <https://159-54-160-137.sslip.io>

---

## Layout

```
apps/
├── crawler/        # hourly: HN (per topic) + RSS (global pool) → embed → raw_data
├── job/            # JOB_CRON (default 5am LA): per-theme RAG → LLM → email recipients
├── archivist/      # daily 03:00: top-10 summarise yesterday + purge raw_data
└── web/            # Next.js 16 + Auth.js admin UI (themes/topics/dashboard/reports)
packages/
└── db/             # @daily/db — shared oracledb pool + Theme/Topic/RawData/... types
db/
├── flyway.conf
└── migrations/
    ├── V1 initial schema      V2 vector index
    ├── V3 drop cron_time      V4 add theme to reports
    └── V5 themes table        V6 ON DELETE CASCADE + raw_data.topic_id NULL (RSS global pool)
docker/             # Dockerfiles per app + docker-compose.yml + Caddyfile
scripts/            # dc wrapper + db-smoke-test + db-probe + send-test-report
docs/superpowers/   # specs/, plans/, reviews/
```

---

## Data model

```
themes  (id, name, emails CSV, active)        ← operator-defined groups
  └── topics (id, theme_id FK, keyword, active)
        └── raw_data.topic_id (FK, NULLABLE — global RSS pool uses NULL)

daily_reports (id, theme_id FK, theme snapshot, content, sent_at)
archived_summary (id, topic_id FK, report_date, rank, ...)
```

- **HackerNews** is keyword-scoped per topic → `raw_data.topic_id` set
- **RSS feeds** (blog + subreddit, 50+ sources) are a **global pool** with `topic_id=NULL`. The job's RAG retrieves them per-theme via embedding cosine similarity, not FK binding
- Deleting a theme cascades to its topics → raw_data → archived_summary → daily_reports (V6 `ON DELETE CASCADE`)

---

## Quick commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all workspace deps |
| `pnpm typecheck` | `tsc --noEmit` across 5 packages |
| `pnpm -r test` | All vitest suites — verify with the latest output |
| `pnpm db:migrate` | Run pending Flyway migrations (also auto-runs on every `deploy.yml`) |
| `pnpm db:info` | Flyway migration history |
| `pnpm db:smoke` | Smoke test: app user wallet auth + SELECT from each table |
| `pnpm db:smoke:schema` | Same but as schema owner (for diag) |
| `pnpm mail:test` | DB row counts → Gmail SMTP test send |
| `pnpm dev:crawler` | Run crawler locally (override `ORACLE_WALLET_DIR=./wallet` in shell) |
| `pnpm dev:job` | Run job locally |
| `pnpm dev:web` | Run Next.js admin UI locally |
| `pnpm dc <args>` | Wrapper for `docker compose --project-name daily-report -f docker/...` |

---

## First-time setup (operator)

1. Bootstrap OCI VM — see `~/Documents/workspace/share-pad/script/oci-vm-bootstrap.md`
2. Upload wallet to `/opt/daily-report/wallet/` via SCP
3. Register GitHub Secrets (see `.env.example` for the full list — Oracle wallet creds, Gmail SMTP, Auth.js + Google OAuth, `ADMIN_EMAILS`, `PUBLIC_HOST`)
4. Create the two Oracle users (DDL owner + app user) as ADMIN
5. `git push` — `deploy.yml` rsyncs + runs Flyway migrate + builds + restarts. Idempotent
6. Open `https://<PUBLIC_HOST>/login`, sign in with a Google account in `ADMIN_EMAILS`, add a theme + topics

---

## Architecture decisions worth knowing

- **`gemma2:9b` on host Ollama** (not 27b — too slow on 4 OCPU ARM). Bind to `0.0.0.0:11434` via systemd override; iptables ACCEPT on 11434
- **Single `JOB_CRON`** (default `0 5 * * *`, interpreted in container `TZ=America/Los_Angeles` set by compose — DST-aware). User-defined themes ARE the grouping — no LLM topic clustering (dropped in V5 refactor)
- **Sources**: HackerNews API (keyword-filtered per topic) + RSS feeds (global pool: 38 blog feeds + 12 subreddit RSS). Reddit JSON API removed — 403s from cloud IPs and OAuth is gated behind their 2024 Responsible Builder Policy
- **`ORACLE_WALLET_DIR=/wallet`** in `.env` is the container path (matches share-pad). Local dev outside Docker overrides per-shell
- **`flyway/flyway:10-alpine`** is pinned — 11-alpine and later dropped Oracle PKI (needed for `cwallet.sso`)
- **oracledb 6.10 Thin mode** has a `sessionCallback` hang bug; per-session `ALTER SESSION` runs in `getConnection()` wrapper instead
- **Auth**: Auth.js v5 (next-auth beta) with Google OAuth; admin-email allowlist gate (`ADMIN_EMAILS` env)
- **Web image**: Next.js standalone build with `outputFileTracingRoot = workspace root` so oracledb native binding is traced into the bundle

---

## Docs

- Design spec: `docs/superpowers/specs/2026-05-13-daily-report-design.md`
- Implementation plan + revision log: `docs/superpowers/plans/2026-05-13-daily-report.md`
- Pre-flight review: `docs/superpowers/reviews/2026-05-13-plan-review.md`
- Shared VM bootstrap: `~/Documents/workspace/share-pad/script/oci-vm-bootstrap.md`
