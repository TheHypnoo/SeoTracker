# Railway deployment

Recommended services:

- `api` (NestJS)
- `jobs` (BullMQ workers)
- `scheduler` (cron dispatch service with Redis lock)
- `web` (TanStack Start)
- `postgresql` plugin
- `redis` plugin

Each code service can use its own Railway config-as-code file. In the Railway
service settings, set the custom config path for each service:

| Service     | Railway config path                     |
| ----------- | --------------------------------------- |
| `api`       | `/infra/railway/api.railway.json`       |
| `jobs`      | `/infra/railway/jobs.railway.json`      |
| `scheduler` | `/infra/railway/scheduler.railway.json` |
| `web`       | `/infra/railway/web.railway.json`       |

Those files use the existing service Dockerfiles. The Dockerfiles build from
the repository root and include workspace dependencies with `--filter=<app>...`;
otherwise Railway can compile an app without first compiling
`@seotracker/server`.

If you use Railpack instead of Dockerfile, configure equivalent commands:

| Service     | Build command                      | Start command                   |
| ----------- | ---------------------------------- | ------------------------------- |
| `api`       | `pnpm --filter api... build`       | `pnpm --filter api start`       |
| `jobs`      | `pnpm --filter jobs... build`      | `pnpm --filter jobs start`      |
| `scheduler` | `pnpm --filter scheduler... build` | `pnpm --filter scheduler start` |
| `web`       | `pnpm --filter web... build`       | `pnpm --filter web start`       |

Use a reverse proxy or Railway edge routing to expose a single domain, forwarding `/api/*` to the API service and the rest to the web service.
