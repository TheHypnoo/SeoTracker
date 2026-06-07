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

Recommended public networking and healthcheck settings:

| Service  | Public domain | Port                         | Healthcheck path           | Custom start command |
| -------- | ------------- | ---------------------------- | -------------------------- | -------------------- |
| `web`    | yes           | `$PORT` (`8080` on Railway)  | `/health`                  | no                   |
| `api`    | optional      | `4000`                       | `/api/v1/health/readiness` | no                   |
| `worker` | no            | `$PORT` (`4101` recommended) | `/health/liveness`         | no                   |

Those files use the existing service Dockerfiles. The Dockerfiles build from
the repository root and include workspace dependencies with `--filter=<app>...`;
otherwise Railway can compile an app without first compiling
`@seotracker/server`.

For the `web` service, set these variables so the Nitro `/api/**` proxy and
server-side session calls reach the private API service:

```bash
VITE_API_URL=/api/v1
PORT=8080
API_PROXY_TARGET=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
SERVER_API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000/api/v1
```

## Database migrations

Run `pnpm db:migrate` as a controlled deploy step before scaling the API service. The API bootstrap also applies pending migrations from `apps/api/drizzle` as a safety net, but relying on concurrent API starts for DDL can create noisy deploys. The worker service never runs migrations.

## Export file storage (object storage)

Generated export files (CSV/…) are produced by the `worker` and downloaded
through the `api`. On Railway these are **separate services with separate,
ephemeral disks**, and Railway volumes cannot be shared between services — so a
local directory does not work and files would vanish on every redeploy. Use an
S3-compatible bucket instead.

1. Create a bucket on any S3-compatible provider (Cloudflare R2, AWS S3 or
   Backblaze B2 all work — the app only speaks the S3 API).
2. Set these variables on **both** the `api` and `worker` services (identical
   values, so the worker writes where the API reads):

   ```bash
   STORAGE_DRIVER=s3
   STORAGE_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com  # omit for AWS S3
   STORAGE_S3_REGION=auto                                          # e.g. eu-west-1 on AWS
   STORAGE_S3_BUCKET=seotracker-exports
   STORAGE_S3_ACCESS_KEY_ID=<key>
   STORAGE_S3_SECRET_ACCESS_KEY=<secret>
   STORAGE_S3_FORCE_PATH_STYLE=false                               # true for MinIO/self-hosted gateways
   ```

No Railway volume is required. Expired files are pruned hourly by the worker's
`reapExpiredExports` cron (`EXPORT_TTL_HOURS`, default 48), so the bucket does
not grow unbounded.

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
