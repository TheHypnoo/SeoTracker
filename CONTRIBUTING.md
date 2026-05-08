# Contribuir a SEOTracker

Guía práctica de cómo trabajar con el repo. Para entender la arquitectura y por qué cada pieza vive donde vive, ver [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerrequisitos

- **Node 22+** (`node --version`)
- **pnpm 10+** (`corepack enable && corepack use pnpm@latest`)
- **Docker** (para Postgres + Redis + Mailhog en local)

## Quick start

```bash
# Una sola vez por checkout
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Stack local (Postgres + Redis + Mailhog)
docker compose -f infra/docker/docker-compose.yml up -d postgres redis mailhog

# Migraciones (la primera vez y después de cada migración nueva)
pnpm --filter api db:migrate

# Dev — todo en paralelo (api, jobs, scheduler, web)
pnpm dev
```

URLs por defecto:

- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/docs
- Web: http://localhost:3000
- Mailhog: http://localhost:8025

## Comandos del monorepo

| Comando             | Qué hace                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`          | Levanta los 4 servicios en paralelo con watch mode (Turbo)                                |
| `pnpm build`        | Compila todo a `dist/` y `.output/`                                                       |
| `pnpm lint`         | `oxlint` en todos los packages que tengan script `lint`                                   |
| `pnpm format`       | Reescribe ficheros con `oxfmt`                                                            |
| `pnpm format:check` | Falla si hay drift de formato                                                             |
| `pnpm typecheck`    | `tsc --noEmit` en todos los packages                                                      |
| `pnpm test`         | `jest` en backend + `vitest run` en frontend                                              |
| `pnpm check`        | `format` + `lint --fix` por package                                                       |
| `pnpm verify`       | `format:check && lint && typecheck && test && build` — lo que corre el pre-push hook y CI |
| `pnpm db:generate`  | `drizzle-kit generate` (genera migraciones desde el schema)                               |
| `pnpm db:migrate`   | Aplica migraciones al Postgres conectado                                                  |
| `pnpm db:studio`    | Abre Drizzle Studio para inspeccionar la DB                                               |

Filtrar a un package: `pnpm --filter <name>` (los nombres están en `package.json` de cada one — `api`, `jobs`, `scheduler`, `web`, `@seotracker/server`, etc).

## Lint y formato

Stack: `oxlint` + `oxfmt` con preset de `ultracite`.

- Configuración raíz: [.oxlintrc.jsonc](.oxlintrc.jsonc), [.oxfmtrc.mjs](.oxfmtrc.mjs)
- Cada app tiene un override mínimo en su carpeta
- **Decisión consciente**: backend (api/jobs/scheduler/server) usa `;`, frontend (web) no. Esto está en sus `.oxfmtrc.mjs` respectivos. No es un bug.

### Reglas desactivadas globalmente

`categories.pedantic` y `categories.style` están off en el root para reducir ruido. Si quieres activar reglas específicas, hazlo en el `rules` del config raíz, no por app.

## TypeScript

- Config base: [packages/config-typescript/base.json](packages/config-typescript/base.json) con `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- Cada app extiende de `nest.json` o `web.json` según su naturaleza.
- Path alias en web: `#/*` y `@/*` mapean a `apps/web/src/*` (configurado en `tsconfig.json` y `vite.config.ts` vía `tsconfigPaths`).

## Cómo añadir...

### Una migración Drizzle

1. Edita el schema: [packages/server/src/database/schema.ts](packages/server/src/database/schema.ts).
2. Genera la migración: `pnpm db:generate`. Crea `apps/api/drizzle/000X_*.sql` y `meta/000X_snapshot.json`.
3. Revisa el SQL generado. Si es destructivo (DROP COLUMN, RENAME), sé extra cuidadoso.
4. Aplica en local: `pnpm db:migrate`.
5. Commitea ambos: el `.sql` + el `_snapshot.json` + el `_journal.json` actualizado.

> ⚠️ **Estado actual del proyecto**: la rama beta de `drizzle-kit` (1.0.0-beta.22) reporta que el folder de migraciones está en formato outdated y bloquea `db:generate`. Hay que ejecutar `pnpm exec drizzle-kit up` antes de poder generar nuevas. Esto está pendiente en el plan de mejoras.

### Un módulo NestJS

```bash
# 1. Crear estructura
mkdir packages/server/src/billing
touch packages/server/src/billing/{billing.module,billing.service,billing.controller}.ts

# 2. Definir el módulo
# (ver patrón existente en cualquier módulo como packages/server/src/sites/sites.module.ts)

# 3. Exportar desde el barrel principal
# packages/server/src/index.ts → export { BillingModule } from './billing/billing.module';

# 4. Importar en apps/api/src/app.module.ts
# Y en apps/worker/src/worker.module.ts si tiene un processor.

# 5. Si hay endpoint nuevo, asegurar @UseGuards(JwtAuthGuard) por defecto
#    (los públicos son la excepción, ver ARCHITECTURE.md → "Endpoints públicos")
```

### Una ruta TanStack Router

TanStack Router usa file-based routing. Las convenciones:

- `dashboard.tsx` → `/dashboard`
- `sites.$id.tsx` → `/sites/:id` (params dinámicos con `$`)
- `_authenticated.tsx` → layout con guard (no genera ruta)
- `_authenticated/dashboard.tsx` → `/dashboard` con `_authenticated` como parent layout
- `-folder/foo.tsx` → no se incluye en el route tree (privado)
- `sites_.$id.audits.$auditId.tsx` → el `_` después del nombre rompe el nesting (no usa `sites.$id` como parent)

Tras crear/renombrar un archivo, TanStack regenera `routeTree.gen.ts` automáticamente en dev. En CI/build, `vite build` lo regenera.

### Un test backend (Jest)

Co-localiza el spec junto al servicio:

```
packages/server/src/audits/audit-processing.service.ts
packages/server/src/audits/audit-processing.service.spec.ts
```

Patrón estándar usando `@nestjs/testing`:

```ts
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../database/database.constants';
import { MyService } from './my.service';

describe('MyService', () => {
  let service: MyService;
  let db: { select: jest.Mock; from: jest.Mock; where: jest.Mock };

  beforeEach(async () => {
    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [MyService, { provide: DRIZZLE, useValue: db }],
    }).compile();
    service = moduleRef.get(MyService);
  });

  it('does the thing', async () => {
    db.where.mockResolvedValueOnce([{ id: 'x' }]);
    const result = await service.doThing();
    expect(result).toEqual(/* ... */);
  });
});
```

Para Drizzle's fluent API que mezcla `await chain` con `chain.limit()/.orderBy()`, usa el helper `thenable()` que verás en [site-issues.service.spec.ts](packages/server/src/audits/site-issues.service.spec.ts).

Correr solo un spec: `pnpm --filter @seotracker/server test -- --testPathPattern audit-processing`.

### Un test frontend (Vitest)

Co-localiza junto al módulo:

```
apps/web/src/lib/auth-store.ts
apps/web/src/lib/auth-store.test.ts
```

Patrón:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ accessToken: null, user: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('login stores accessToken', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'tok', user: { id: 'u' } }), {
        status: 200,
      }),
    );
    await useAuthStore.getState().login({ email: 'a@b.c', password: 'pw' });
    expect(useAuthStore.getState().accessToken).toBe('tok');
  });
});
```

Correr solo un spec: `pnpm --filter web test -- auth-store`.

> ⚠️ Nota sobre `Response` con status 204: jsdom no permite body para 204. Usa `new Response(null, { status: 204 })`.

## Hooks de git

`simple-git-hooks` configurado en el `package.json` raíz:

- **pre-commit**: `pnpm format:check && pnpm lint`
- **pre-push**: `pnpm verify`

Se instalan automáticamente al hacer `pnpm install` (vía script `prepare`). Si el entorno no tiene `.git/hooks/`, el script salta limpiamente.

Para saltar un hook puntualmente: `git push --no-verify`. **Hazlo solo en emergencias** y arregla el motivo después.

## Estructura de imports

### Frontend

- Path alias `#/*` y `@/*` para `apps/web/src/*` (configurado en tsconfig + Vite).
- **Sin barrel files** en `components/`. Importa directo al fichero:
  ```ts
  // ✅ Bien
  import { WebhookCard } from '#/components/integrations/webhook-card';
  // ❌ Evitar
  import { WebhookCard } from '#/components/integrations';
  ```
  Razón: HMR más rápido, tree-shaking más fiable, dependencias más explícitas.

### Backend

- `packages/server` exporta TODO desde [packages/server/src/index.ts](packages/server/src/index.ts) — esto sí es un barrel (es el API público del package, no código de app interno).
- Internamente, los módulos de `packages/server` se importan entre sí con paths relativos.

## Convenciones de PR

1. Una unidad lógica por PR. Refactor + feature en el mismo PR es bandera roja.
2. `pnpm verify` en local antes de pushear (el pre-push lo hace por ti).
3. Si tocas el schema, incluye la migración generada y un SQL revisado a mano.
4. Si añades un endpoint público (sin `JwtAuthGuard`), justifícalo en el PR description y añade rate-limit (`@Throttle`).
5. Frontend con UI nueva: prueba en navegador antes de marcar como ready. Type-check no captura visual regressions.
6. Refactor de un componente >300 líneas: idealmente acompañar de tests para su lógica extraída a hooks/funciones puras.

## Decisiones documentadas

Cosas que han parecido raras durante revisiones y tienen un motivo:

- **`drizzle-orm` en `1.0.0-beta.22`** y no en la latest stable (0.45.x): la rama v1 tiene mejoras de TS que queremos. Aceptamos breaking changes hasta que salga estable.
- **`nitro: npm:nitro-nightly@…`**: necesario para el plugin Vite de Nitro 3 que permite el proxy same-origin. Sin esto, el bug de auth con cookies cross-origin vuelve.
- **Backend con `;`, frontend sin `;`**: idiomas de cada subequipo. No tocar.
- **`refresh_token` HttpOnly + `csrf_token` legible + `accessToken` en memoria**: estándar de OWASP para SaaS B2B. Ver ARCHITECTURE.md → Auth.
- **`/auth/session` no rota el refresh token**: invariante crítica. Cambiarlo dispara race conditions documentadas.
- **`apps/web/src/components/<route>/`**: convención del proyecto para componentes co-localizados con su route. NO usar `routes/_authenticated/-route/` (probado, peor DX).
