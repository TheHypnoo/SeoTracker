# SEOTracker

> Spanish version: [README.es.md](README.es.md)

SEOTracker is a full-stack monorepo for running, scheduling and comparing SEO audits against your own sites. It is split into a NestJS HTTP API, a BullMQ workers service, a cron scheduler, and a TanStack Start frontend, all built on top of a shared backend runtime and a typed-domain shared package.

## Repository structure

```
seotracker/
├── apps/
│   ├── api/           # NestJS HTTP entrypoint (REST /api/v1, Swagger, auth)
│   ├── jobs/          # BullMQ workers (audits, exports, outbound webhooks)
│   ├── scheduler/     # Cron dispatcher with Redis-backed distributed lock
│   └── web/           # TanStack Start + React + Tailwind v4 frontend
├── packages/
│   ├── server/        # Shared backend runtime (Drizzle schema, Nest modules, queue, lock)
│   ├── shared-types/  # Enums + ApiError + PaginatedResponse shared by backend and frontend
│   ├── config-typescript/  # Shared TS preset
│   └── config-tailwind/    # Shared Tailwind v4 preset
├── infra/
│   ├── docker/        # Dockerfiles + docker-compose dev stack
│   ├── proxy/         # Reverse-proxy config
│   ├── render/        # render.yaml
│   └── railway/       # Railway deploy notes
├── scripts/           # Repo-level helper scripts (e.g. git hooks bootstrap)
├── .github/workflows/ # CI + dependency review
├── package.json, pnpm-workspace.yaml, turbo.json
├── .oxlintrc.jsonc, .oxfmtrc.mjs
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
- pnpm 10+
- Docker (for the local Postgres/Redis/Mailhog stack)

## Quick start

```bash
git clone <repo-url>
cd seotracker
pnpm install

# Set up env files (copy and fill the placeholders)
cp apps/api/.env.example apps/api/.env
cp apps/jobs/.env.example apps/jobs/.env
cp apps/scheduler/.env.example apps/scheduler/.env
cp apps/web/.env.example apps/web/.env

# Generate JWT secrets and paste them into apps/api/.env
openssl rand -base64 48  # → JWT_ACCESS_SECRET
openssl rand -base64 48  # → JWT_REFRESH_SECRET

# Start local infrastructure
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailhog

# Apply database migrations (one-shot)
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
pnpm dev            # turbo run dev --parallel
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

## Linting and formatting

The monorepo uses `oxlint` + `oxfmt` with Ultracite presets.

- Root shared base: `.oxlintrc.jsonc`, `.oxfmtrc.mjs`.
- Each app may add framework-specific overrides (e.g. `apps/web/.oxlintrc.jsonc` for React rules).

```bash
pnpm format        # rewrite files with oxfmt
pnpm lint          # oxlint across the monorepo
pnpm check         # format + oxlint --fix per workspace
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

Migrations are owned by the API workspace and live in `apps/api/drizzle/`. They are **not** executed at process boot — run them as a one-shot deploy step:

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
- **`docker compose up` fails** — make sure Docker Desktop is running and that ports 5432/6379/1025/8025 are free.
- **API refuses to boot with "JWT secret looks like a placeholder"** — generate real secrets with `openssl rand -base64 48` and update `apps/api/.env`. The validator rejects values starting with `change-this`, `__replace_me__` or `replace-me`.
- **Frontend hits 401 in a redirect loop** — the dev proxy must be reachable; make sure the API is up at `http://localhost:4000` and that `apps/web/.env` matches the API's `CSRF_COOKIE_NAME`.
- **Pre-commit hook says nothing changed but lint still fails** — run `pnpm check` once to apply autofixes, then re-stage the changes.
