# SEOTracker

> English version: [README.md](README.md)
> La versión en inglés es la fuente de verdad. Este documento es una traducción de cortesía.

SEOTracker es un monorepo full-stack para ejecutar, programar y comparar auditorías SEO contra tus propios sitios. Está dividido en una API HTTP en NestJS, un servicio de workers BullMQ, un scheduler con cron, y un frontend con TanStack Start, todo construido sobre un runtime de backend compartido y un paquete de tipos compartidos.

## Estructura del repositorio

```
seotracker/
├── apps/
│   ├── api/           # Punto de entrada HTTP en NestJS (REST /api/v1, Swagger, auth)
│   ├── jobs/          # Workers BullMQ (auditorías, exports, webhooks salientes)
│   ├── scheduler/     # Dispatcher cron con lock distribuido en Redis
│   └── web/           # Frontend TanStack Start + React + Tailwind v4
├── packages/
│   ├── server/        # Runtime compartido (schema Drizzle, módulos Nest, queue, lock)
│   ├── shared-types/  # Enums + ApiError + PaginatedResponse compartidos backend ↔ frontend
│   ├── config-typescript/  # Preset compartido de TypeScript
│   └── config-tailwind/    # Preset compartido de Tailwind v4
├── infra/
│   ├── docker/        # Dockerfiles + docker-compose para desarrollo
│   ├── proxy/         # Configuración del reverse proxy
│   ├── render/        # render.yaml
│   └── railway/       # Notas de despliegue en Railway
├── scripts/           # Scripts auxiliares del repo (ej. setup de git hooks)
├── .github/workflows/ # CI + dependency review
├── package.json, pnpm-workspace.yaml, turbo.json
├── .oxlintrc.jsonc, .oxfmtrc.mjs
└── README.md
```

Cada subdirectorio tiene su propio `README.md` con detalles.

## Stack

- **Backend:** NestJS 11, Drizzle ORM (PostgreSQL), BullMQ (Redis), logging con pino, Argon2 para contraseñas, JWT de acceso + refresh tokens rotatorios, CSRF double-submit, Helmet.
- **Frontend:** TanStack Start (React + SSR con Nitro), TanStack Router, TanStack Query, Zustand, Tailwind v4.
- **Tooling:** pnpm workspaces + Turborepo, oxlint + oxfmt + presets de Ultracite, simple-git-hooks, Jest, Vitest, GitHub Actions.

El frontend está en español (la audiencia objetivo es hispanohablante). El código, los comentarios, JSDoc y los mensajes de commit están en inglés.

## Requisitos

- Node.js 22+
- pnpm 10+
- Docker (para el stack local de Postgres/Redis/Mailhog)

## Puesta en marcha rápida

```bash
git clone <url-del-repo>
cd seotracker
pnpm install

# Preparar los .env (copiar y rellenar placeholders)
cp apps/api/.env.example apps/api/.env
cp apps/jobs/.env.example apps/jobs/.env
cp apps/scheduler/.env.example apps/scheduler/.env
cp apps/web/.env.example apps/web/.env

# Generar los secretos JWT y pegarlos en apps/api/.env
openssl rand -base64 48  # → JWT_ACCESS_SECRET
openssl rand -base64 48  # → JWT_REFRESH_SECRET

# Levantar la infraestructura local
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailhog

# Aplicar las migraciones de la base de datos (una sola vez)
pnpm db:migrate

# Arrancar todos los workspaces en modo dev
pnpm dev
```

## URLs por defecto

| Servicio   | URL                                                       |
| ---------- | --------------------------------------------------------- |
| API        | <http://localhost:4000/api/v1>                            |
| Swagger UI | <http://localhost:4000/docs>                              |
| Web        | <http://localhost:3000>                                   |
| Mailhog    | <http://localhost:8025>                                   |
| Postgres   | `localhost:5432` (`postgres` / `postgres` / `seotracker`) |
| Redis      | `localhost:6379`                                          |

## Scripts disponibles (raíz)

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

## Linting y formato

El monorepo usa `oxlint` + `oxfmt` con presets de Ultracite.

- Base compartida en la raíz: `.oxlintrc.jsonc`, `.oxfmtrc.mjs`.
- Cada app puede añadir overrides específicos del framework (por ejemplo `apps/web/.oxlintrc.jsonc` para reglas de React).

```bash
pnpm format        # reescribe archivos con oxfmt
pnpm lint          # oxlint en todo el monorepo
pnpm check         # format + oxlint --fix por workspace
pnpm verify        # comprobación completa pre-push
```

## Git hooks

`simple-git-hooks` está configurado en la raíz:

- `pre-commit`: `pnpm format:check && pnpm lint`
- `pre-push`: `pnpm verify`

Los hooks se instalan automáticamente con el script `prepare` de la raíz la primera vez que ejecutas `pnpm install`.

## CI

GitHub Actions corre en pull requests y pushes a la rama principal:

- `pnpm verify` (format check, lint, typecheck, test, build)
- Dependency review en pull requests

Ver `.github/workflows/`.

## Migraciones de base de datos

Las migraciones las gestiona el workspace `api` y viven en `apps/api/drizzle/`. **No** se ejecutan al arrancar el proceso — se aplican como un paso puntual del despliegue:

```bash
pnpm db:migrate
```

Para crear una migración nueva después de editar `packages/server/src/database/schema.ts`:

```bash
pnpm db:generate
```

Para inspeccionar los datos con Drizzle Studio:

```bash
pnpm db:studio
```

## Solución de problemas

- **Puerto ocupado** — cambia el puerto en el `.env` correspondiente (`PORT=` para la API, `vite dev --port` para web) o detén el proceso que lo está usando.
- **`docker compose up` falla** — asegúrate de que Docker Desktop está arrancado y de que los puertos 5432/6379/1025/8025 están libres.
- **La API no arranca y dice "JWT secret looks like a placeholder"** — genera secretos reales con `openssl rand -base64 48` y actualiza `apps/api/.env`. El validador rechaza valores que empiezan por `change-this`, `__replace_me__` o `replace-me`.
- **El frontend entra en bucle de 401** — el proxy de desarrollo debe poder llegar a la API; comprueba que la API está levantada en `http://localhost:4000` y que `apps/web/.env` coincide con el `CSRF_COOKIE_NAME` de la API.
- **El hook de pre-commit dice que no hay cambios pero el lint sigue fallando** — ejecuta `pnpm check` para aplicar autofixes y vuelve a stagear los cambios.
