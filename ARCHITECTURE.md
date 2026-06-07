# SEOTracker · Arquitectura

Documento de referencia técnico. Describe cómo encajan las piezas a alto nivel y dónde vive cada cosa. Para instrucciones de "cómo levantar el proyecto" o "cómo añadir X", ver [CONTRIBUTING.md](./CONTRIBUTING.md).

## Visión general

SEOTracker es un sistema SaaS multi-tenant para auditar dominios y exponer la salud SEO de un sitio. El monorepo se divide en tres servicios desplegables y un runtime compartido:

```
            ┌─────────────────────────────────────────────────────────┐
            │                       Postgres                          │
            └──┬───────────────────────────────────────────────────┬──┘
               │                                                   │
               │                                                   │
  ┌────────────▼────────────┐   ┌───────────────────────┐
  │  apps/api  (NestJS)     │   │ apps/worker (NestJS)  │
  │  REST /api/v1 + Swagger │   │ BullMQ + cron         │
  │  Auth + autorización    │   │ - audits              │
  │  Throttling + metrics   │   │ - exports             │
  └────────────┬────────────┘   │ - email deliveries    │
               │                │ - outbound webhooks   │
               │                │ - scheduler + lock    │
               │                └───────────┬───────────┘
               │                            │
               └─────────────┬──────────────┘
                             │
                ┌────────────▼────────────┐
                │         Redis           │
                │  - BullMQ queues        │
                │  - Distributed lock     │
                └─────────────────────────┘

                ┌─────────────────────────┐
                │  apps/web (TanStack     │  ← consumer del API; mismo origin
                │   Start + React 19)     │     vía proxy Nitro
                └─────────────────────────┘
```

Cada app importa de `packages/server`, donde vive todo el código compartido (módulos NestJS, esquema Drizzle, servicios de cola, scheduler, dominio).

---

## Layout del monorepo

| Path                                                       | Descripción                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [apps/api](apps/api)                                       | Entrypoint HTTP. NestJS 11 + Express. Sólo monta módulos y bootstrap; toda la lógica está en `packages/server`. |
| [apps/worker](apps/worker)                                 | Workers BullMQ + cron de auditorías programadas, reconciliación de email/colas y lock distribuido en Redis.     |
| [apps/web](apps/web)                                       | Frontend SPA + SSR. TanStack Start (Vite + Nitro) + React 19 + Tailwind v4.                                     |
| [packages/server](packages/server)                         | Runtime compartido del backend. Todo el dominio. ~30k LOC.                                                      |
| [packages/shared-types](packages/shared-types)             | Enums + tipos comunes back/front (`AuditStatus`, `Severity`, `OutboundEvent`, etc.).                            |
| [packages/config-typescript](packages/config-typescript)   | tsconfigs base (`base.json`, `nest.json`, `web.json`).                                                          |
| [infra/docker](infra/docker)                               | Dockerfiles + `docker-compose.yml` para stack local.                                                            |
| [infra/proxy](infra/proxy), [infra/railway](infra/railway) | Reverse proxy + manifests de despliegue (Railway).                                                              |

---

## Módulos del backend (`packages/server/src`)

| Módulo                      | Responsabilidad                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`                      | Registro, login, refresh-token rotation, CSRF, password reset. JWT en cookie HttpOnly + access token en memoria del cliente.                                                                     |
| `users`                     | CRUD usuarios, preferencias (`activeProjectId`).                                                                                                                                                 |
| `projects`                  | Proyectos (multi-tenancy unit), miembros. Contiene `OnboardingService` que escucha `user.registered` y crea proyecto + preferences default.                                                      |
| `sites`                     | Dominios dentro de un proyecto. Schedule diario/semanal.                                                                                                                                         |
| `invitations`               | Invitar usuarios al proyecto.                                                                                                                                                                    |
| `audits`                    | Orquestación de auditorías. Procesa jobs de cola, ejecuta el motor, persiste resultados, compara runs, genera action plans y expone telemetría del motor.                                        |
| `seo-engine`                | Motor SEO: crawler + análisis HTML + scoring + eventos de telemetría por etapa. Subdividido en `homepage-html-analyzer`, `sitemap-discovery`, `link-graph`, `page-crawler`, `cross-page-checks`. |
| `alerts`                    | Reglas de alerta por regresión de score.                                                                                                                                                         |
| `google` / `search-console` | OAuth de Google, properties Search Console, import diario de métricas y keywords.                                                                                                                |
| `notifications`             | Inbox interno + envío SMTP. Templates inline (futura migración a engine).                                                                                                                        |
| `outbound-webhooks`         | Webhooks salientes a URLs del cliente. HMAC-SHA256 signing, throttle por queue, deliveries history con polling.                                                                                  |
| `webhooks`                  | Webhooks entrantes (trigger de auditoría externo).                                                                                                                                               |
| `exports`                   | CSV exports. Strategy pattern (`HistoryCsvStrategy`, `IssuesCsvStrategy`, `MetricsCsvStrategy`, `ComparisonCsvStrategy`, `AuditResultCsvStrategy`, etc.).                                        |
| `queue`                     | BullMQ queues + `JobFailuresService` (DLQ table + alert webhook con throttle por queue) + `DistributedLockService`.                                                                              |
| `scheduling`                | Cron-driven dispatch, reconciliación de jobs huérfanos, limpieza de exports expirados e import Search Console.                                                                                   |
| `system-logs`               | Logs de eventos visibles en la UI (warn/info/error con contexto).                                                                                                                                |
| `activity-log`              | Auditoría funcional de actividad de proyecto visible en settings.                                                                                                                                |
| `metrics`                   | Prometheus metrics + HTTP interceptor + BullMQ collector.                                                                                                                                        |
| `health`                    | Liveness + readiness probes.                                                                                                                                                                     |
| `database`                  | Conexión Drizzle, esquema completo (38 tablas), constants.                                                                                                                                       |

---

## Flujo de autenticación

Resuelto recientemente tras varios bugs: race condition de refresh tokens, cookies cross-origin, login bounce. El diseño actual tiene una invariante clave: **el servidor es la única fuente de verdad de la sesión**.

```
        ┌────────────┐                      ┌──────────────┐
        │  Browser   │   POST /auth/login   │  apps/api    │
        │  /login    │ ───────────────────▶ │  AuthService │
        └────────────┘                      └──────┬───────┘
              ▲                                    │
              │     200 { accessToken, user }      │
              │ ◀──────────────────────────────────┘
              │     Set-Cookie: refresh_token=…    │ HttpOnly, SameSite=Lax
              │     Set-Cookie: csrf_token=…       │ readable client-side
              │
              │ Zustand store: { accessToken, user }
              │ (access token solo en memoria, NUNCA en localStorage)
```

### SSR — invariante "sin race"

Cada navegación del frontend (incluido el primer paint SSR) llama a `getServerSession()` (server function de TanStack Start). Esta server function golpea `GET /api/v1/auth/session`, que **valida el refresh token sin rotarlo**. Esto es crítico: si la SSR llamara a `/auth/refresh` (que sí rota), múltiples cargas concurrentes (root loader + protected layout `beforeLoad`) competirían por rotar el mismo token y se invalidarían entre sí. Con `getSession` read-only no hay race.

```
GET /auth/session ─▶ AuthService.getSession(refreshToken)
                    │
                    ├─ verify refresh JWT
                    ├─ lookup en refresh_tokens (no revoked, not expired)
                    └─ retorna { user }    (NO rota, NO Set-Cookie)
```

El `__root` loader llama a `getServerSession` UNA vez, lo guarda en `RouterContext.session`, y cada child route lo lee del context vía `useLoaderData({ from: '__root__' })`.

### Refresh transparente

El access token caduca cada 15 minutos. Cuando `ApiClient` recibe un 401:

1. Comprueba que el path no es `/auth/refresh` (loop guard)
2. Llama a `refreshSession()` con **single-flight**: si ya hay una rotación en curso, espera la misma promesa en lugar de disparar otra
3. En `refreshSession`:
   - 200 → guarda nuevo accessToken + user, reintenta el request original
   - 401/403 → auth real fallida → limpia store, navega a `/login`
   - 429/500/transient → mantiene la sesión, surfacea el error sin desloguear

Tests cubren todas estas ramas en [auth-store.test.ts](apps/web/src/lib/auth-store.test.ts) y [api-client.test.ts](apps/web/src/lib/api-client.test.ts).

### CSRF

Patrón "double-submit cookie": el `csrf_token` se envía como cookie no-HttpOnly (legible por JS) y el cliente lo manda también en el header `x-csrf-token`. El servidor compara header vs cookie con `safeEqual` (timing-safe). Aplica a `/auth/refresh` y `/auth/logout`.

### Same-origin

Vite (vía Nitro `routeRules`) proxea `/api/**` al backend en dev, así que el browser ve `localhost:3000` para todo y las cookies del API fluyen sin cross-origin shenanigans. En producción, un reverse proxy (`infra/proxy`) hace lo mismo.

---

## Pipeline de auditoría

```
                                   ┌─────────────────────┐
                                   │  Cliente (manual)   │
                                   │  o Scheduler (cron) │
                                   └──────────┬──────────┘
                                              │ POST /sites/:id/audits/run
                                              ▼
                                   ┌─────────────────────┐
                                   │  AuditsService      │
                                   │  (en api process)   │
                                   │  - crea audit_run   │
                                   │    QUEUED           │
                                   │  - encola job       │
                                   └──────────┬──────────┘
                                              │
                                  Redis ──────┴──────▶ BullMQ "seo-audits"
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │ worker process      │
                                   │  AuditsProcessor    │
                                   │  → AuditProcessing  │
                                   │    Service          │
                                   └──────────┬──────────┘
                                              │
                ┌────────────┬─────────────┬──┴──┬──────────────┬──────────────┐
                ▼            ▼             ▼     ▼              ▼              ▼
        check status  check concurrency  RUN  fetch homepage  fan-out      score + persist
        != QUEUED →   per-project >=     →    + analyze       crawl pages  + dispatch
        skip          limit → re-enqueue       (HTML)         (depth-1+2)  webhooks +
                                                                            notifs +
                                                                            alerts
```

`AuditProcessingService.processQueuedRun(auditRunId, perProjectConcurrency)` orquesta los 7 pasos del motor SEO (extraídos a módulos en R1):

1. `analyzeHomepageHtml` — checks estáticos (HTTPS, HSTS, redirect, compresión, peso, DOM, meta tags, OG/Twitter, JSON-LD, mixed content)
2. `discoverSiteMetadata` — favicon, robots.txt, soft-404, sitemap discovery
3. `buildLinkGraph` — extracción internal/external + stratified sample para depth-1
4. `crawlPages` — depth-1 GET + depth-2 (opcional) + HEAD checks de remaining
5. `runCrossPageChecks` — duplicate content (jaccard) + thin content
6. `scoreAudit` — agregación final por categoría con caps por severidad

Después del análisis: best-effort post-procesos (reconcile site_issues, rescore tras ignored fingerprints) que **NO abortan el run** si fallan, pero quedan trazados en `system_logs.warn`. Esto es B3 del plan de auditoría.

### Observabilidad

- `OutboundWebhooksService.dispatch` envía eventos `audit.completed`, `audit.failed`, `issue.critical`, `site.regression` a webhooks salientes registrados con HMAC-SHA256.
- `NotificationsService.createForProjectMembers` + `sendEmailToProjectMembers` despachan notificaciones in-app + email.
- `AlertsService.evaluateRegression` evalúa reglas de regresión y dispara alertas.
- Errores de jobs van a la tabla `job_failures` + alert webhook con throttle per-queue (`ALERT_WEBHOOK_URL`).
- Cada run persiste eventos de `audit_engine_telemetry` (stage, status, duration, details) para waterfall por auditoría y dashboards internos de salud del motor (`/engine-health`).

### Telemetría interna del motor

Además de métricas Prometheus, cada auditoría guarda una traza estructurada por etapa en `audit_engine_telemetry`:

- `stage`, `status`, `durationMs`, `error`, `details` por paso del motor.
- Waterfall por auditoría: `GET /api/v1/audits/:auditId/engine-telemetry`.
- Salud agregada: `GET /api/v1/engine-health`, `engine-health/timeseries` y `engine-health/model-versions`.
- UI interna: `/engine-health` y `/sites/:id/engine-health`, protegidas por `PlatformAdminGuard` y `PLATFORM_ADMIN_EMAILS`.

### Benchmark de scoring (+200 webs)

`packages/server/scripts/score-calibration-domains.txt` mantiene un corpus de 216 webs públicas para calibrar regresiones del modelo de scoring. El script `pnpm --filter @seotracker/server score:calibrate` ejecuta el motor sobre el corpus, genera JSON + reporte Markdown en `tmp/score-calibration/` y opcionalmente compara contra PageSpeed/Lighthouse SEO (`--with-pagespeed --pagespeed-strategy both`).

---

## Scheduler distribuido

`apps/worker` corre los processors BullMQ y las tareas cron en un único proceso:

| Task                       | Frecuencia       | Propósito                                                                  |
| -------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `runDueSchedules`          | cada minuto      | Encola auditorías programadas que tocan en esta ventana.                   |
| `reconcileEmailDeliveries` | cada 5 min       | Re-enqueue de emails atascados en `PENDING`.                               |
| `reconcileQueuedWork`      | cada 5 min       | Re-enqueue de auditorías/exports/webhooks que quedaron en estado inicial.  |
| `reapExpiredExports`       | cada hora        | Borra ficheros expirados de object storage y marca exports como `EXPIRED`. |
| `importSearchConsoleData`  | diario 04:00 UTC | Encola imports recientes para cada link activo de Google Search Console.   |

`runDueSchedules` está envuelto en `DistributedLockService.runWithLock`:

```
SET key=scheduler:run-due-schedules
    value=<random uuid token>
    NX EX 90      # solo 1 instancia gana
```

El proceso ganador refresca el TTL cada 1/3 del periodo via Lua script. Si el refresh falla 2 veces consecutivas, aborta vía `AbortSignal` propagado al caller. En `finally`, libera el lock comparando el token (Lua atómico) — un proceso que perdió el lock no puede liberar el del ganador.

Esto permite escalar el worker horizontalmente (`docker compose up --scale worker=3`) sin que múltiples réplicas ejecuten el mismo tick.

---

## Frontend — `apps/web`

### Routing (TanStack Start file-based)

```
src/routes/
├── __root.tsx                # SSR session resolution + chrome
├── index.tsx                 # landing
├── login.tsx, register.tsx, forgot-password.tsx, reset-password.$token.tsx
├── invite.$token.tsx
├── legal.{privacy,terms,security}.tsx
└── _authenticated.tsx        # layout guard (requireAuth)
    └── _authenticated/
        ├── dashboard.tsx
        ├── engine-health.tsx          # plataforma/admin
        ├── notifications.tsx
        ├── projects.$id.{sites,audits,issues,exports}.tsx
        ├── projects.new.tsx
        ├── settings.{general,team,integrations,activity}.tsx
        ├── sites.$id.tsx
        ├── sites_.$id.{search,engine-health}.tsx
        └── sites_.$id.audits.$auditId.tsx
```

Convención: archivos con `_` prefix son layouts (no rutas). Archivos con `-` prefix son privados (no se incluyen en el route tree). Subdirectorios con `-` también.

### Componentes co-localizados por dominio

```
src/components/
├── activity/        # actividad de proyecto
├── audit-detail/    # detalle de auditoría + waterfall de telemetría
├── charts/          # ScoreTrendChart, MultiSeriesTrendChart (recharts)
├── dashboard/       # KPIs y vista principal
├── engine-health/   # dashboard interno p50/p95/error-rate por etapa
├── integrations/    # Google / webhooks / settings integrations
├── layout/          # sidebar, chrome, command palette
├── members/         # equipo y permisos
├── search-console/  # métricas GSC por sitio
├── site-detail/     # detalle de sitio, badge público y resumen de salud
└── *.tsx            # primitivas: button, badge, modal, text-input, switch-field, query-state, ...
```

**Sin barrel files**. Imports directos al fichero (mejor HMR, mejor tree-shaking, más explícito sobre la procedencia).

### State

- **TanStack Query** — server state. `staleTime: 30s`, `gcTime: 5m`, `retry: 1`, `refetchOnWindowFocus: false`. Mutation cache global con toast en error.
- **Zustand** — auth store (`useAuthStore`): `accessToken`, `user`, login/logout/refresh.
- **React Context** — `ProjectProvider` (active project switching) + `ToastProvider`.

### Tailwind v4

CSS-first. Variables custom en [styles.css](apps/web/src/styles.css): `--color-brand-500`, `--text-heading-1`, `--shadow-md`, etc. Sin `tailwind.config.js`.

---

## Tooling y DX

| Herramienta | Versión     | Notas                                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------------------- |
| pnpm        | 11.0.8      | workspaces + frozen lockfile en CI                                                    |
| Turborepo   | 2.9.9       | pipelines: build, dev, lint, test, typecheck, format, format:check, check             |
| TypeScript  | 6.0.3       | strict + noUncheckedIndexedAccess + noImplicitOverride                                |
| oxlint      | 1.63.0      | 95 reglas built-in. Categories `pedantic` y `style` desactivadas.                     |
| oxfmt       | 0.48.0      | back: `semi: true`, web: `semi: false` (decisión consciente, idiomas distintos)       |
| ultracite   | 7.6.3       | preset (oxlint configs son `.mjs`, no se extienden directamente desde JSONC)          |
| Vite        | 8.0.11      | dev server con Nitro routeRules para `/api` proxy                                     |
| nitro       | nightly 3.0 | aliased a `nitro-nightly`; necesario para el plugin Vite que arregla auth same-origin |
| drizzle-orm | 0.45.2      | fijado y alineado entre `api` y `@seotracker/server`                                  |
| Jest        | 30          | backend (131 tests)                                                                   |
| Vitest      | 4.1.5       | frontend (26 tests, jsdom)                                                            |

`pnpm verify` = format:check → lint → typecheck → test → build. Ejecuta en el pre-push hook (`simple-git-hooks`) y en CI.

---

## Decisiones de diseño explícitas

1. **Backend en NestJS, no Express puro**: queremos DI + validación class-validator + decorators para Swagger. El coste (boilerplate) compensa por la cantidad de módulos.
2. **Drizzle, no Prisma**: queremos SQL legible en logs + migraciones manuales auditables, sin engine binario en runtime.
3. **drizzle-orm fijado**: `api` y `@seotracker/server` deben usar la misma versión para evitar drift entre migrator, schema y runtime.
4. **TanStack Start, no Next.js**: SSR + server fns + file-based routing sin Vercel lock-in. El plugin Nitro permite same-origin trivial para el proxy `/api`.
5. **JWT en HttpOnly cookie + access token en memoria**: combina seguridad XSS-resistente del HttpOnly con la portabilidad del Bearer header para el access token. Refresh token nunca toca JS.
6. **CSRF double-submit cookie + safeEqual**: simple, sin server-side state. Suficiente para el modelo de threat de un SaaS B2B.
7. **BullMQ, no SQS/RabbitMQ**: Redis ya estaba en el stack para distributed locks; añadir un broker más sería overhead innecesario.
8. **Scheduler en proceso aparte**: aislamiento de fallos. Si el scheduler crashea, los workers siguen procesando lo que ya esté en cola.
9. **Strategy pattern para exports**: cada CSV kind es testeable aisladamente; añadir un nuevo kind = un archivo nuevo, sin tocar el orquestador.
10. **No barrel files en `apps/web/src/components/`**: imports directos al fichero. Mejor HMR, mejor tree-shaking, dependencias más explícitas.

---

## Endpoints públicos (sin `JwtAuthGuard`)

| Endpoint                               | Throttle | Notas                                         |
| -------------------------------------- | -------- | --------------------------------------------- |
| `POST /auth/register`                  | 5/min    | Throttle credenciales                         |
| `POST /auth/login`                     | 5/min    | Idem                                          |
| `POST /auth/refresh`                   | n/a      | Requiere `refresh_token` cookie + CSRF header |
| `GET /auth/session`                    | n/a      | Read-only para SSR (no rota)                  |
| `POST /auth/logout`                    | n/a      | Limpia cookies + revoca token en DB           |
| `POST /auth/password/forgot`           | 5/min    | Throttle                                      |
| `POST /auth/password/reset`            | 5/min    | Throttle                                      |
| `GET /api/v1/health/liveness`          | público  | k8s/Railway probe del API                     |
| `GET /api/v1/health/readiness`         | público  | Comprueba Postgres + Redis                    |
| `POST /webhooks/incoming/:endpointKey` | público  | HMAC verificado en el service                 |

Todo lo demás bajo `/api/v1` requiere `JwtAuthGuard` global aplicado en `AppModule`.

---

## Referencias rápidas

- **README**: [README.md](README.md)
- **Cómo añadir una migración / módulo / route**: [CONTRIBUTING.md](CONTRIBUTING.md)
