---
name: docker-linux
description: Docker multi-stage builds, Compose orchestration, non-root users, health checks, and Linux deployment conventions
tags: [docker, compose, linux, deployment, containers]
---

# Docker / Linux Deployment Conventions

## Priority

**Critical**

## Instructions

**ALWAYS** use multi-stage Dockerfiles — builder stage compiles, runner stage copies only the binary or built artifacts (ID: DOC-001)

**NEVER** use the `root` user in the runtime stage — create a non-root user and switch to it before `CMD` (ID: DOC-002)

**ALWAYS** declare a named bridge network in `docker-compose.yml` and attach all services to it explicitly (ID: DOC-003)

**NEVER** use `network_mode: host` in production compose files (ID: DOC-004)

**ALWAYS** add a `healthcheck` to every service in compose — use `wget --spider` or `curl -f` on the health endpoint (ID: DOC-005)

**ALWAYS** use `depends_on: condition: service_healthy` for any service that depends on another — never plain `depends_on` (ID: DOC-006)

**ALWAYS** set `restart: unless-stopped` on all production services (ID: DOC-007)

**ALWAYS** set `container_name` explicitly on all services (ID: DOC-008)

**ALWAYS** set `deploy.resources.limits` for cpu and memory on all production services (ID: DOC-009)

**NEVER** hardcode credentials in compose files — use `.env` file via `env_file: - ./.env` (ID: DOC-010)

**ALWAYS** commit `.env.example` with every variable documented — gitignore `.env` (ID: DOC-011)

**ALWAYS** configure log rotation: `logging.driver: json-file` with `max-size: 10m` and `max-file: 3` (ID: DOC-012)

**ALWAYS** use `profiles:` for optional services like seed/migrate — never include them in the default `up` (ID: DOC-013)

**NEVER** write one Dockerfile for multiple services — one Dockerfile per service (ID: DOC-014)

### Rust Multi-Stage Dockerfile

```dockerfile
# Build stage
FROM rust:1.82-alpine AS builder

RUN apk add --no-cache musl-dev openssl-dev pkgconfig

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

RUN cargo build --release --bin my-service

# Runtime stage
FROM alpine:3.20 AS runner

RUN apk add --no-cache ca-certificates libgcc

# Non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=builder /build/target/release/my-service ./my-service

USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["./my-service"]
```

### Bun/Node Multi-Stage Dockerfile

```dockerfile
# Build stage
FROM oven/bun:1.3-alpine AS builder

WORKDIR /build

# Copy package files first — cache layer
COPY package.json bun.lock ./
COPY packages/my-service/package.json ./packages/my-service/

RUN bun install --frozen-lockfile

COPY . .

RUN bun --cwd packages/my-service run build

# Runtime stage
FROM oven/bun:1.3-alpine AS runner

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder /build/packages/my-service/dist ./dist
COPY --from=builder /build/packages/my-service/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules

USER app

EXPOSE 2727
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2727/health || exit 1

CMD ["bun", "run", "dist/index.js"]
```

### Compose Service with Healthcheck and Dependency

```yaml
services:
  api:
    container_name: myapp-api
    build:
      context: .
      dockerfile: services/api/Dockerfile
    env_file:
      - ./.env
    ports:
      - "3000:3000"
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.25"
          memory: 128M

  postgres:
    container_name: myapp-postgres
    image: postgres:16-alpine
    env_file:
      - ./.env
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER -d $POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.5"
          memory: 256M

networks:
  app-network:
    driver: bridge

volumes:
  postgres-data:
```

### Optional Services with Profiles

```yaml
services:
  # ... production services above ...

  # Run with: docker compose --profile migrate up migrate
  migrate:
    container_name: myapp-migrate
    build:
      context: .
      dockerfile: services/api/Dockerfile
      target: builder
    command: ["bun", "run", "db:migrate"]
    env_file:
      - ./.env
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy
    profiles:
      - migrate

  # Run with: docker compose --profile seed up seed
  seed:
    container_name: myapp-seed
    build:
      context: .
      dockerfile: services/api/Dockerfile
      target: builder
    command: ["bun", "run", "db:seed"]
    env_file:
      - ./.env
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy
    profiles:
      - seed
```

### Dev Override

`docker-compose.dev.yml` — volume mounts for hot reload, debug settings:

```yaml
services:
  api:
    environment:
      NODE_ENV: development
      RUST_LOG: debug
    volumes:
      - ./services/api/src:/app/src:ro
    command: ["bun", "--watch", "src/index.ts"]
```

Run dev stack:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### `.env.example`

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myapp_db
POSTGRES_USER=myapp_user
POSTGRES_PASSWORD=change_me_in_production

# Application
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Secrets (generate with: openssl rand -hex 32)
SESSION_SECRET=change_me_in_production
```

## Common Mistakes

- **Running as root in the runtime stage**: If the container is compromised, root access means full host filesystem access (if volumes are mounted). Always create and switch to a non-root user.
- **Plain `depends_on` without `condition: service_healthy`**: Without health conditions, Docker starts the dependent service as soon as the dependency container starts — not when it's ready. The API will crash-loop trying to connect to a database that isn't accepting connections yet.
- **Copying the entire build context into the runner stage**: The runner stage only needs the final artifact (binary or `dist/`). Copying `node_modules` from source, source files, or build toolchain bloats the image significantly.
- **Hardcoding database credentials in `docker-compose.yml`**: Credentials in compose files end up in version control. Always use `env_file` referencing a gitignored `.env` file. Commit `.env.example` instead.
- **Missing log rotation on production services**: Without `max-size` and `max-file`, Docker log files grow unbounded and can fill the disk on production hosts.
- **Including seed/migration containers in the default `up`**: Seed and migration services should only run on demand. Use `profiles:` to keep them out of the default service set.
- **One Dockerfile for multiple services**: Leads to conditional logic, large build contexts, and unclear ownership. Each service gets its own Dockerfile in its service directory.
