# `@seotracker/config-typescript`

Shared TypeScript configuration presets for every workspace in the monorepo.

## What it sets

- `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`.
- Shared safety defaults: `forceConsistentCasingInFileNames` and `skipLibCheck`.
- `nest.json`: NodeNext modules/resolution, `target: ES2023`, decorators metadata and `outDir: dist` for NestJS packages/apps.
- `web.json`: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx` and `noEmit` for the TanStack Start frontend.

## Usage

```jsonc
// apps/<workspace>/tsconfig.json
{
  "extends": "@seotracker/config-typescript/nest.json",
  "compilerOptions": {
    "rootDir": "src",
  },
  "include": ["src/**/*"],
}
```
