# SEOTracker

> Spanish version: [README.es.md](README.es.md)

SEOTracker is a full-stack monorepo for running, scheduling and comparing SEO audits against your own sites. It is split into a NestJS HTTP API, a unified BullMQ worker/scheduler service, and a TanStack Start frontend, all built on top of a shared backend runtime and a typed-domain shared package.

## Repository structure

```
seotracker/
├── apps/
│   ├── api/           # NestJS HTTP entrypoint (REST /api/v1, Swagger, auth)
│   ├── worker/        # BullMQ processors + cron scheduler
│   └── web/           # TanStack Start + React + Tailwind v4 frontend
├── packages/
│   ├── server/        # Shared backend runtime (Drizzle schema, Nest modules, queue, lock)
│   ├── shared-types/  # Enums + DTOs shared by backend and frontend
│   └── config-typescript/  # Shared TS preset
├── infra/
│   ├── docker/        # Dockerfiles + docker-compose dev stack
│   ├── proxy/         # Reverse-proxy config
│   └── railway/       # Railway deploy notes
├── scripts/           # Repo-level helper scripts (e.g. git hooks bootstrap)
├── .github/workflows/ # CI + dependency review
├── package.json, pnpm-workspace.yaml, turbo.json
├── oxlint.config.ts, oxfmt.config.ts
└── README.md
```

Each subdirectory has its own `README.md` with details.

## Stack

- **Backend:** NestJS 11, Drizzle ORM (PostgreSQL), BullMQ (Redis), pino logging, Argon2 passwords, JWT access + rotating refresh tokens, CSRF double-submit, Helmet.
- **Frontend:** TanStack Start (React + Nitro SSR), TanStack Router, TanStack Query, Zustand, Tailwind v4.
- **Tooling:** pnpm workspaces + Turborepo, oxlint + oxfmt + Ultracite presets, simple-git-hooks, Jest, Vitest, GitHub Actions CI.

The frontend is in Spanish (the target audience is Spanish-speaking). Code, comments, JSDoc and commit messages are in English.

## Requirements

- Node.js 22+
- pnpm 11.0.8 (use Corepack: `corepack enable && corepack prepare pnpm@11.0.8 --activate`)
- Docker (for the local Postgres/Redis/Mailhog stack)

## Quick start

```bash
git clone <repo-url>
cd seotracker
pnpm install

# Set up env files (copy and fill the placeholders)
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env

# Generate JWT secrets and paste them into BOTH apps/api/.env AND apps/worker/.env
# (the worker signs/verifies the same tokens as the API, so the secrets must match)
openssl rand -base64 48  # → JWT_ACCESS_SECRET
openssl rand -base64 48  # → JWT_REFRESH_SECRET

# Start local infrastructure
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailhog

# Apply migrations up front (recommended; the API also checks them at boot)
pnpm db:migrate

# Run every workspace in dev mode
pnpm dev
```

## Default URLs

| Service    | URL                                                       |
| ---------- | --------------------------------------------------------- |
| API        | <http://localhost:4000/api/v1>                            |
| Swagger UI | <http://localhost:4000/docs>                              |
| Web        | <http://localhost:3000>                                   |
| Mailhog    | <http://localhost:8025>                                   |
| Postgres   | `localhost:5432` (`postgres` / `postgres` / `seotracker`) |
| Redis      | `localhost:6379`                                          |

## Available scripts (root)

```bash
pnpm dev            # turbo run dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm format:check
pnpm check
pnpm verify         # format:check + lint + typecheck + test + build
pnpm db:generate    # drizzle-kit generate (apps/api)
pnpm db:migrate     # drizzle-kit migrate (apps/api)
pnpm db:studio      # drizzle-kit studio
```

## Operational observability

SEOTracker includes an internal SEO-engine telemetry system. Every audit records per-stage duration, status and diagnostic details in `audit_engine_telemetry`; platform administrators can inspect audit waterfalls and aggregate engine health from the web UI (`/engine-health`, site-level engine health) or the API (`/api/v1/engine-health*`). Access is gated by `PLATFORM_ADMIN_EMAILS`.

The backend also ships a score-calibration benchmark corpus with **216 public websites** in `packages/server/scripts/score-calibration-domains.txt`. Run it with `pnpm --filter @seotracker/server score:calibrate` and optionally compare against Google PageSpeed/Lighthouse SEO scores with `--with-pagespeed`.

## Linting and formatting

The monorepo uses `oxlint` + `oxfmt` with Ultracite presets.

- Root config: `oxlint.config.ts`, `oxfmt.config.ts`.
- Package-level scripts are reserved for build, dev, test and typecheck. Linting and formatting run from the root.

```bash
pnpm format        # rewrite files with oxfmt
pnpm lint          # oxlint across the monorepo
pnpm check         # Ultracite aggregate check
pnpm fix           # apply Ultracite autofixes
pnpm verify        # full pre-push check
```

## Git hooks

`simple-git-hooks` is configured at the root:

- `pre-commit`: `pnpm format:check && pnpm lint`
- `pre-push`: `pnpm verify`

Hooks are installed via the root `prepare` script the first time you run `pnpm install`.

## CI

GitHub Actions runs on pull requests and pushes to the main branch:

- `pnpm verify` (format check, lint, typecheck, test, build)
- Dependency review on pull requests

See `.github/workflows/`.

## Database migrations

Migrations are owned by the API workspace and live in `apps/api/drizzle/`. The API applies pending migrations during bootstrap as a safety net; running them explicitly before starting/scaling services is still recommended:

```bash
pnpm db:migrate
```

To create a new migration after editing `packages/server/src/database/schema.ts`:

```bash
pnpm db:generate
```

Inspect data with the Drizzle Studio:

```bash
pnpm db:studio
```

## Troubleshooting

- **Port already in use** — change the port in the relevant `.env` (`PORT=` for API, `vite dev --port` for web) or stop the conflicting process.
- **`docker compose up` fails with "port is already allocated"** — a local Postgres/Redis is binding 5432/6379. Stop it (e.g. `brew services stop postgresql redis`) or remap the host ports in `infra/docker/docker-compose.yml` and update `DATABASE_URL` / `REDIS_URL` in the `.env` files accordingly.
- **`docker compose up` fails for other reasons** — make sure Docker Desktop is running and that ports 5432/6379/1025/8025 are free.
- **API refuses to boot with "JWT secret looks like a placeholder"** — generate real secrets with `openssl rand -base64 48` and update `apps/api/.env`. The validator rejects values starting with `change-this`, `__replace_me__` or `replace-me`.
- **Frontend hits 401 in a redirect loop** — the dev proxy must be reachable; make sure the API is up at `http://localhost:4000` and that `apps/web/.env` matches the API's `CSRF_COOKIE_NAME`.
- **Pre-commit hook says nothing changed but lint still fails** — run `pnpm fix` once to apply autofixes, then re-stage the changes.
