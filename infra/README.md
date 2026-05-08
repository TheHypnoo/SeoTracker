# `infra/`

Deployment and local-infrastructure assets. Nothing in here runs on its own — every subdirectory targets a specific platform or operational concern.

## Layout

| Subdirectory | Purpose                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker/`    | Dockerfiles for `api`, `worker`, `web` and a `docker-compose.yml` that spins up the dev stack (Postgres, Redis, Mailhog, plus the three services).                |
| `proxy/`     | Reverse-proxy configuration for environments that front the API and web services with a single domain (forwards `/api/*` to the API and the rest to the web app). |
| `render/`    | `render.yaml` for one-click deploy on Render.                                                                                                                     |
| `railway/`   | Railway-specific deploy notes. See [`railway/README.md`](railway/README.md).                                                                                      |

## Local development quickstart

From the repo root:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailhog
```

This brings up the stateful dependencies and Mailhog (SMTP catch-all on port 8025). The service containers are also defined in the compose file if you want to run everything in Docker; for development it's usually faster to run the apps with `pnpm dev` and only run the dependencies in Docker.

## Production notes

- Run `pnpm db:migrate` once during deploy, before scaling up replicas. The API does not auto-migrate at boot.
- Set `NODE_ENV=production` in every service so Swagger is hidden and pino logs in JSON.
- Provide real secrets for `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars, no placeholder prefixes — the env validator rejects them).
- Front everything with a reverse proxy that terminates TLS and sets `X-Forwarded-For` / `CF-Connecting-IP` headers correctly so per-user throttling works.
