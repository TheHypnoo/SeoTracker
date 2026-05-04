# Railway deployment

Recommended services:

- `api` (NestJS)
- `jobs` (BullMQ workers)
- `scheduler` (cron dispatch service with Redis lock)
- `web` (TanStack Start)
- `postgresql` plugin
- `redis` plugin

Use a reverse proxy or Railway edge routing to expose a single domain, forwarding `/api/*` to the API service and the rest to the web service.
