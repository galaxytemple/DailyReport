# daily-report

Personal daily-report system. Crawls HN + Reddit + curated tech/macro RSS feeds for user-defined topics, runs cluster-aware LLM analysis on Oracle 23ai vector RAG, and emails one report per thematic cluster every morning.

Runs on OCI Always Free Ampere A1 (4 OCPU, 24 GB RAM) via Docker Compose, Caddy, and rsync-based GitHub Actions deploy. Same infra pattern as `~/Documents/workspace/share-pad`.

---

## Layout

```
apps/
├── crawler/        # hourly: HN + Reddit + 41 curated RSS → embed → raw_data
├── job/            # JOB_CRON (default 5am): cluster topics → RAG → LLM → email
├── archivist/      # Phase 4 (pending) — daily top-10 summarise + purge
└── web/            # Phase 5 (pending) — Next.js admin UI
packages/
└── db/             # @daily/db — shared oracledb pool + Topic/RawData/... types
db/
├── flyway.conf
└── migrations/     # V1 schema, V2 vector index, V3 drop cron_time, V4 add theme
docker/             # Dockerfiles per app + docker-compose.yml + Caddyfile
scripts/            # dc wrapper + db-smoke-test + db-probe + send-test-report
docs/superpowers/   # specs/, plans/, reviews/
```

---

## Quick commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all workspace deps |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm -r test` | All vitest suites (currently 5 files / 26 cases on crawler + 4/17 on job) |
| `pnpm db:migrate` | Run pending Flyway migrations via the tools profile |
| `pnpm db:info` | Flyway migration history |
| `pnpm db:smoke` | Smoke test: app user wallet auth + SELECT from each table |
| `pnpm db:smoke:schema` | Same but as schema owner (for diag) |
| `pnpm mail:test` | DB row counts → Gmail SMTP test send |
| `pnpm dev:crawler` | Run crawler locally (override `ORACLE_WALLET_DIR=./wallet` in shell) |
| `pnpm dev:job` | Run job locally |
| `pnpm dc <args>` | Wrapper for `docker compose --project-name daily-report -f docker/...` |

---

## First-time setup (operator)

1. Bootstrap OCI VM — see `~/Documents/workspace/share-pad/script/oci-vm-bootstrap.md` (`oci-vm-bootstrap.md`)
2. Upload wallet to `/opt/daily-report/wallet/` via SCP
3. Register GitHub Secrets (~17 entries — see plan §7 `2026-05-13-daily-report.md`)
4. Create the two Oracle users (DDL owner + app user) as ADMIN
5. `pnpm db:migrate` — apply V1–V4
6. `git push` — triggers `.github/workflows/deploy.yml` → first deploy

---

## Architecture decisions worth knowing

- **`gemma2:9b` on host Ollama** (not 27b — too slow on 4 OCPU ARM). Bind to `0.0.0.0:11434` via systemd override; iptables ACCEPT on 11434.
- **One global `JOB_CRON`** (default `0 5 * * *`). Per-topic cron was abandoned — LLM clusters all active topics each tick and produces one unified report + email per cluster.
- **Reddit** uses public `.json` endpoint (no OAuth app needed) but cloud IPs are often 403-blocked; open follow-up.
- **41 curated RSS feeds** in `apps/crawler/src/feeds.ts` — verified live from the VM. When RSS body < 500 chars, follow the article link and extract main text via `cheerio`.
- **`ORACLE_WALLET_DIR=/wallet`** in `.env` is the container path (matches share-pad). Local dev outside Docker overrides per-shell.
- **`flyway/flyway:10-alpine`** is pinned — 11-alpine and later dropped Oracle PKI (needed for `cwallet.sso`).
- **oracledb 6.10 Thin mode** has a `sessionCallback` hang bug; per-session `ALTER SESSION` runs in `getConnection()` wrapper instead.

---

## Docs

- Design spec: `docs/superpowers/specs/2026-05-13-daily-report-design.md`
- Implementation plan + revision log: `docs/superpowers/plans/2026-05-13-daily-report.md`
- Pre-flight review: `docs/superpowers/reviews/2026-05-13-plan-review.md`
- Shared VM bootstrap: `~/Documents/workspace/share-pad/script/oci-vm-bootstrap.md`
