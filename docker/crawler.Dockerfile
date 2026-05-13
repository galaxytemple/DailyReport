# Node 22 + pnpm + tsx for apps/crawler.
# Single stage — small, runs via tsx (no compile step).
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
