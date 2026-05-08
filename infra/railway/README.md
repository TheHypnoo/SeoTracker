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

The old split `jobs` and `scheduler` entrypoints were replaced by this unified
`worker` service so the Railway project fits in five services.

Use a reverse proxy or Railway edge routing to expose a single domain,
forwarding `/api/*` to the API service and the rest to the web service.
