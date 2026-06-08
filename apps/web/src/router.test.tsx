import { describe, expect, it } from 'vitest';

import { getRouter } from './router';

describe('frontend startup smoke test', () => {
  it('creates the application router with the generated route tree', () => {
    const router = getRouter();

    expect(router).toBeTruthy();
    expect(router.routesByPath).toHaveProperty('/');
    expect(router.routesByPath).toHaveProperty('/login');
    expect(router.routesByPath).toHaveProperty('/dashboard');
  });
});
