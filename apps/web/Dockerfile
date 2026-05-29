FROM node:24-slim AS base

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm --filter @finance/web build

EXPOSE 3000
CMD ["pnpm", "--filter", "@finance/web", "start"]
