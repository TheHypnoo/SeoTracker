# `@seotracker/config-typescript`

Shared TypeScript base configuration for every workspace in the monorepo.

## What it sets

- `strict: true` (with `noUncheckedIndexedAccess` enabled).
- ES2022 target / module / lib.
- `moduleResolution: bundler` for app workspaces; the package consumers extend with their own `module` value when needed (e.g. `commonjs` for the NestJS apps).
- Sensible defaults for `esModuleInterop`, `forceConsistentCasingInFileNames`, `skipLibCheck`.

## Usage

```jsonc
// apps/<workspace>/tsconfig.json
{
  "extends": "@seotracker/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
  },
  "include": ["src/**/*"],
}
```
