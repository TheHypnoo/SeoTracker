# Railway deployment

Recommended services:

- `api` (NestJS)
- `worker` (BullMQ workers + cron scheduler)
- `web` (TanStack Start)
- `postgresql` plugin
- `redis` plugin

Each code service can use its own Railway config-as-code file. In the Railway
service settings, set the custom config path for each service:

| Service  | Railway config path                  |
| -------- | ------------------------------------ |
| `api`    | `/infra/railway/api.railway.json`    |
| `worker` | `/infra/railway/worker.railway.json` |
| `web`    | `/infra/railway/web.railway.json`    |

Those files use the existing service Dockerfiles. The Dockerfiles build from
the repository root and include workspace dependencies with `--filter=<app>...`;
otherwise Railway can compile an app without first compiling
`@seotracker/server`.

If you use Railpack instead of Dockerfile, configure equivalent commands:

| Service  | Build command                   | Start command                |
| -------- | ------------------------------- | ---------------------------- |
| `api`    | `pnpm --filter api... build`    | `pnpm --filter api start`    |
| `worker` | `pnpm --filter worker... build` | `pnpm --filter worker start` |
| `web`    | `pnpm --filter web... build`    | `pnpm --filter web start`    |

For larger deployments, `jobs` and `scheduler` can still be deployed as
separate services with `/infra/railway/jobs.railway.json` and
`/infra/railway/scheduler.railway.json`, but the recommended Railway setup uses
the unified `worker` service to fit within a 5-service project.

Use a reverse proxy or Railway edge routing to expose a single domain,
forwarding `/api/*` to the API service and the rest to the web service.
