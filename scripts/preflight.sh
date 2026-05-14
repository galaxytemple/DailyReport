#!/usr/bin/env bash
# Pre-push sanity checks for Docker / Next.js traps we've already paid for
# during this project's deploys. Run this before `git push` to catch the
# patterns that previously made it to OCI and broke production.
#
# Returns non-zero (and lists failures) if any check fails.
#
# Each check is documented with the commit / memory that captured the
# original incident, so a future operator can see WHY the check exists.

set -euo pipefail
cd "$(dirname "$0")/.."

FAILED=0
declare -a FAILURES=()

fail() {
  FAILED=1
  FAILURES+=("$1")
  echo "  ✗ $1"
}
pass() {
  echo "  ✓ $1"
}

# ─────────────────────────────────────────────────────────────────────
# 1. Every app Dockerfile that runs corepack must pin pnpm explicitly.
#    Bare `corepack enable` makes corepack fetch pnpm latest the first
#    time it's invoked → ERR_PNPM_NO_PKG_MANIFEST against pnpm@9 workspace.
#    Memory: docker-corepack-pnpm-pin.md
# ─────────────────────────────────────────────────────────────────────
echo "→ Dockerfile pnpm pin"
for f in docker/*.Dockerfile; do
  if grep -qE '^\s*RUN.*corepack enable' "$f"; then
    if grep -qE 'corepack prepare pnpm@[0-9]' "$f"; then
      pass "$(basename "$f") pins pnpm via corepack prepare"
    else
      fail "$(basename "$f") has 'corepack enable' but NO 'corepack prepare pnpm@X.Y.Z --activate'"
    fi
  fi
done

# ─────────────────────────────────────────────────────────────────────
# 2. apps/web/next.config.ts must set outputFileTracingRoot for monorepo.
#    Without it, oracledb native binding doesn't make it into .next/standalone
#    and the runtime crashes on first DB-touching request.
#    Memory: nextjs16-standalone-monorepo-tracing.md
# ─────────────────────────────────────────────────────────────────────
echo "→ Next.js standalone tracing"
NEXT_CONFIG="apps/web/next.config.ts"
if [ -f "$NEXT_CONFIG" ]; then
  if grep -q "outputFileTracingRoot" "$NEXT_CONFIG"; then
    pass "$NEXT_CONFIG sets outputFileTracingRoot"
  else
    fail "$NEXT_CONFIG missing outputFileTracingRoot — oracledb won't be bundled into standalone"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 3. web.Dockerfile builder stage must inherit FROM deps so pnpm-workspace.yaml
#    + package.json files are present when `pnpm --filter @daily/web build`
#    runs. Otherwise ERR_PNPM_NO_PKG_MANIFEST.
#    Memory: docker-corepack-pnpm-pin.md (trap 2)
# ─────────────────────────────────────────────────────────────────────
echo "→ web.Dockerfile builder inheritance"
WEB_DF="docker/web.Dockerfile"
if [ -f "$WEB_DF" ]; then
  if grep -qE 'FROM\s+deps\s+AS\s+builder' "$WEB_DF"; then
    pass "$WEB_DF builder stage inherits FROM deps"
  else
    fail "$WEB_DF builder stage NOT 'FROM deps AS builder' — manifests will be missing"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 4. web.Dockerfile runner stage must set PORT and HOSTNAME for Next.js
#    standalone. Without HOSTNAME=0.0.0.0 the server binds in a way the
#    in-container healthcheck (127.0.0.1:3000) can't reach.
#    Memory: docker-corepack-pnpm-pin.md (trap 5)
# ─────────────────────────────────────────────────────────────────────
echo "→ web.Dockerfile runner env"
if [ -f "$WEB_DF" ]; then
  if grep -qE 'ENV HOSTNAME=0\.0\.0\.0' "$WEB_DF" && grep -qE 'ENV PORT=' "$WEB_DF"; then
    pass "$WEB_DF runner sets PORT + HOSTNAME=0.0.0.0"
  else
    fail "$WEB_DF runner missing ENV PORT or ENV HOSTNAME=0.0.0.0"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 5. apps/web/public/ must exist (Next.js standalone COPY assumes it).
#    Memory: docker-corepack-pnpm-pin.md (trap 3)
# ─────────────────────────────────────────────────────────────────────
echo "→ apps/web/public exists"
if [ -d "apps/web/public" ]; then
  pass "apps/web/public/ exists"
else
  fail "apps/web/public/ missing — runner stage COPY will fail; add .gitkeep"
fi

# ─────────────────────────────────────────────────────────────────────
# 6. tsx-running Dockerfiles should bypass pnpm in CMD. With pnpm wrapping,
#    docker TTY allocation doesn't reach the tsx child → stdout block-buffered
#    → `docker logs <svc>` is empty for hours.
#    Memory: docker-stdout-buffering-pnpm-wrapper.md
# ─────────────────────────────────────────────────────────────────────
echo "→ tsx-service CMD bypasses pnpm"
for svc in crawler job archivist; do
  df="docker/${svc}.Dockerfile"
  [ -f "$df" ] || continue
  cmd_line=$(grep -E '^CMD\s+\[' "$df" || true)
  if echo "$cmd_line" | grep -q 'pnpm'; then
    fail "$df CMD still uses pnpm — child stdout will be block-buffered"
  elif echo "$cmd_line" | grep -qE 'node.*--import.*tsx'; then
    pass "$df CMD uses node --import tsx (PID 1 tsx)"
  fi
done

# ─────────────────────────────────────────────────────────────────────
# 7. .dockerignore exists so local node_modules / .next / wallet don't
#    bloat the build context.
# ─────────────────────────────────────────────────────────────────────
echo "→ .dockerignore present"
if [ -f .dockerignore ]; then
  pass ".dockerignore exists"
else
  fail ".dockerignore missing — local node_modules etc will be in build context"
fi

# ─────────────────────────────────────────────────────────────────────
# 8. New SQL migrations should name their FKs (no bare REFERENCES).
#    Unnamed FKs get SYS_C names that differ per env — later DROP requires
#    PL/SQL anon-block lookup. Stable names avoid that.
#    Memory: oracle-unnamed-fk-drop-plsql.md
# ─────────────────────────────────────────────────────────────────────
echo "→ SQL migration FK naming"
LATEST=$(ls db/migrations/V*.sql 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$LATEST" ]; then
  # Match `REFERENCES x(y)` NOT preceded by `CONSTRAINT name FOREIGN KEY (...)`
  # via a simple heuristic: count REFERENCES not in a CONSTRAINT line.
  bare=$(grep -cE '^\s*[a-z_]+\s+NUMBER.*REFERENCES' "$LATEST" 2>/dev/null || true)
  named=$(grep -cE 'CONSTRAINT\s+\w+_fk\s+FOREIGN KEY' "$LATEST" 2>/dev/null || true)
  if [ "$bare" -gt 0 ] && [ "$named" -eq 0 ]; then
    fail "$LATEST has $bare unnamed FKs (REFERENCES). Use CONSTRAINT <name>_fk FOREIGN KEY ..."
  else
    pass "$LATEST has named or no FKs"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
echo
if [ $FAILED -ne 0 ]; then
  echo "❌ Preflight failed (${#FAILURES[@]} check(s)). Fix before pushing:"
  printf '   - %s\n' "${FAILURES[@]}"
  exit 1
fi
echo "✅ All preflight checks passed."
