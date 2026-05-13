# Node 22 + pnpm + tsx for apps/archivist.
# Cron at 03:00 — summarises yesterday's raw_data and purges.
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
