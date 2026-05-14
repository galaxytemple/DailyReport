# Node 22 + pnpm + tsx for apps/archivist.
# Cron at 03:00 — summarises yesterday's raw_data and purges.
FROM node:22-alpine
# Pin pnpm — bare `corepack enable` makes corepack fetch latest (pnpm 11+)
# which then errors on this pnpm@9 workspace.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/archivist/package.json ./apps/archivist/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/archivist/src ./apps/archivist/src

CMD ["pnpm", "--filter", "@daily/archivist", "start"]
