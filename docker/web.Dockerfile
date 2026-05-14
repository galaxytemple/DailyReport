# Next.js 16 standalone build for apps/web.
# Multi-stage to keep the runtime image small (~150 MB).
FROM node:22-alpine AS base
# Pin pnpm explicitly — `corepack enable` alone makes corepack fetch
# `latest` (pnpm 11+) the first time it's invoked, which then errors
# because the workspace was authored against pnpm 9.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Inherit the manifests + node_modules from `deps` so pnpm has a workspace
# root to operate from. Without this, `pnpm --filter` errors with
# ERR_PNPM_NO_PKG_MANIFEST because /app/package.json doesn't exist.
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_BUILD_ID=local
RUN pnpm --filter @daily/web build

FROM base AS runner
ENV NODE_ENV=production
# Next.js standalone server.js reads PORT and HOSTNAME from env. Without
# HOSTNAME=0.0.0.0 the server may bind in a way the in-container healthcheck
# (TCP connect to 127.0.0.1) can't reach.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
