# Node 22 + pnpm + tsx for apps/job.
# Reaches Ollama on host via host.docker.internal:11434 (configured in compose).
FROM node:22-alpine
# Pin pnpm — bare `corepack enable` makes corepack fetch latest (pnpm 11+)
# which then errors on this pnpm@9 workspace.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/job/package.json ./apps/job/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/job/src ./apps/job/src

# Bypass pnpm so TTY reaches Node's stdout (see crawler.Dockerfile).
WORKDIR /app/apps/job
CMD ["node", "--import", "tsx", "src/index.ts"]
