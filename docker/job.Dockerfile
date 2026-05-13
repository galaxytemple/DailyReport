# Node 22 + pnpm + tsx for apps/job.
# Reaches Ollama on host via host.docker.internal:11434 (configured in compose).
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/job/package.json ./apps/job/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/db/src ./packages/db/src
COPY apps/job/src ./apps/job/src

CMD ["pnpm", "--filter", "@daily/job", "start"]
