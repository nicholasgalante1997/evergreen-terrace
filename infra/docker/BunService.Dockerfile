FROM oven/bun:1.3.13-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY . .
RUN bun install --frozen-lockfile

FROM dependencies AS build
RUN bun run --cwd packages/contracts build \
  && bun run --cwd packages/service-runtime build \
  && bun run --cwd packages/persistence build \
  && bun run --cwd services/command-api build \
  && bun run --cwd services/outbox-relay build \
  && bun run --cwd services/projection build \
  && bun run --cwd services/read-api build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=bun:bun /app /app
USER bun
