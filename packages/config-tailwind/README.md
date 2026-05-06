# `@seotracker/config-tailwind`

Shared Tailwind CSS v4 preset for `apps/web` (and any future frontend that joins the monorepo).

Holds the design tokens (brand colour scale, typography, spacing extensions) so they only have to be tweaked in one place.

## Usage

The frontend imports the preset from its own Tailwind config / Vite plugin setup. See [`apps/web`](../../apps/web) for the wiring.

## Scripts

```bash
pnpm typecheck
pnpm lint
```
