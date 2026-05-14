# Node 22 + pnpm + tsx for apps/crawler.
# Single stage — small, runs via tsx (no compile step).
FROM node:22-alpine
# Pin pnpm — bare `corepack enable` makes corepack fetch latest (pnpm 11+)
# which then errors on this pnpm@9 workspace.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/crawler/package.json ./apps/crawler/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/crawler/src ./apps/crawler/src

# Run tsx directly (no pnpm wrapper) so this becomes PID 1 and docker's TTY
# allocation actually reaches Node's stdout. With pnpm in the middle, child
# stdout gets re-piped through pnpm's own streams and stays block-buffered
# regardless of `tty: true` on the container.
WORKDIR /app/apps/crawler
CMD ["node", "--import", "tsx", "src/index.ts"]
