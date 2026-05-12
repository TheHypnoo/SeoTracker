# `apps/web`

User-facing frontend built with [TanStack Start](https://tanstack.com/start) + React + Tailwind v4. Renders on the server (Nitro) and hydrates on the client.

## What it does

- Public pages: landing, login, register, forgot/reset password, accept invite, legal.
- Authenticated app (under the `_authenticated` layout): dashboard, projects, sites, audits, comparisons, settings (team + integrations), notifications.
- Manual and bulk audit triggers, score/issue history, comparison views, async export downloads.

The UI strings visible to end users are in Spanish by design (target audience is Spanish-speaking). Code, comments, JSDoc and commit messages are in English.

## Architecture highlights

- **Routing:** file-based via TanStack Router (`src/routes/`). `__root.tsx` resolves the visitor's session **once** per request via a server function and exposes it through the router context, so child loaders and `beforeLoad` guards read the same session without racing additional refresh calls.
- **Auth:** SSR-resolved session using a read-only `/auth/session` endpoint (does not rotate the refresh token). The access token lives in memory in a Zustand store; cookies (HttpOnly refresh + non-HttpOnly CSRF) flow same-origin via the dev/prod proxy.
- **API client:** [`src/lib/api-client.ts`](src/lib/api-client.ts) handles single-flight 401 auto-refresh, 429/Retry-After honouring, GET deduplication and typed errors.
- **Server state:** TanStack Query with mutation-cache global error toasts (opt-out via `meta.skipGlobalErrorToast`).
- **Components:** Base UI primitives + Tailwind utility classes + a small in-house toast bridge.

## Scripts

```bash
pnpm dev          # vite dev --port 3000
pnpm build
pnpm preview
pnpm start        # production: node .output/server/index.mjs
pnpm test         # vitest
pnpm typecheck
```

## Environment

Copy `.env.example` to `.env`.

| Variable                | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_API_URL`          | Public API base path used by the browser (defaults to `/api/v1` to flow through the same-origin proxy) |
| `SERVER_API_URL`        | Absolute API URL used by Node fetch during SSR (relative paths cannot be resolved server-side)         |
| `VITE_CSRF_COOKIE_NAME` | Must match the API's `CSRF_COOKIE_NAME`                                                                |

## Development notes

- The dev server proxies `/api/*` to the backend; this is configured via Nitro `routeRules`, not Vite's own `server.proxy`, because TanStack Start uses the Nitro dev server end-to-end.
- TanStack devtools and Router devtools panels are mounted in development.
