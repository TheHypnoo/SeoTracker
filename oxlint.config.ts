import { defineConfig } from 'oxlint';

import core from 'ultracite/oxlint/core';
import jest from 'ultracite/oxlint/jest';
import nestjs from 'ultracite/oxlint/nestjs';
import react from 'ultracite/oxlint/react';
import vitest from 'ultracite/oxlint/vitest';

const jestRules = {
  'jest/no-confusing-set-timeout': 'off',
};

const jestOverrides = (jest.overrides ?? []).map((override) => ({
  ...override,
  files: [
    'apps/api/**/*.{test,spec}.{ts,tsx,js,jsx}',
    'packages/server/**/*.{test,spec}.{ts,tsx,js,jsx}',
  ],
  rules: { ...override.rules, ...jestRules },
}));

const vitestOverrides = (vitest.overrides ?? []).map((override) => ({
  ...override,
  files: [
    'apps/web/**/*.{test,spec}.{ts,tsx,js,jsx}',
    'apps/web/**/__tests__/**/*.{ts,tsx,js,jsx}',
  ],
}));

export default defineConfig({
  extends: [core, react, nestjs],
  ignorePatterns: [
    'apps/api/drizzle/**/*.js',
    'apps/api/drizzle/**/*.js.map',
    'apps/api/drizzle.config.d.ts',
    'apps/api/drizzle.config.js',
    'apps/api/drizzle.config.js.map',
    'apps/web/src/routeTree.gen.ts',
    '**/coverage/**',
    '**/dist/**',
    '**/.output/**',
    '**/.tanstack/**',
    '**/.turbo/**',
  ],
  rules: {
    'class-methods-use-this': 'off',
    'arrow-body-style': 'off',
    curly: 'off',
    eqeqeq: 'off',
    'func-style': 'off',
    'import/consistent-type-specifier-style': 'off',
    'import/first': 'off',
    'max-classes-per-file': 'off',
    complexity: 'off',
    'no-bitwise': 'off',
    'no-inline-comments': 'off',
    'no-negated-condition': 'off',
    'no-nested-ternary': 'off',
    'no-plusplus': 'off',
    'no-alert': 'off',
    'no-script-url': 'off',
    'no-use-before-define': 'off',
    'prefer-destructuring': 'off',
    'promise/avoid-new': 'off',
    'promise/prefer-await-to-callbacks': 'off',
    'promise/prefer-await-to-then': 'off',
    'require-await': 'off',
    'sort-keys': 'off',
    'typescript/array-type': 'off',
    'typescript/consistent-type-imports': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-reduce': 'off',
    'unicorn/no-array-sort': 'off',
    'unicorn/no-document-cookie': 'off',
    'unicorn/no-nested-ternary': 'off',
    'unicorn/no-useless-switch-case': 'off',
    'unicorn/no-unreadable-iife': 'off',
    'unicorn/numeric-separators-style': 'off',
    'unicorn/number-literal-case': 'off',
    'unicorn/prefer-add-event-listener': 'off',
    'typescript/no-extraneous-class': ['error', { allowWithDecorator: true }],
    'typescript/parameter-properties': 'off',
    'typescript/consistent-type-definitions': 'off',
    'unicorn/no-useless-undefined': 'off',
    'unicorn/switch-case-braces': 'off',
    'unicorn/no-thenable': 'off',
    'unicorn/prefer-response-static-json': 'off',
    'promise/prefer-catch': 'off',
    // The rule trips on @RequirePermission and other NestJS decorators that
    // legitimately appear inside JSDoc blocks documenting controllers.
    'jsdoc/check-tag-names': 'off',
    // Reports false positives on `.catch((reason: unknown) => {})` callbacks.
    'promise/valid-params': 'off',
  },
  overrides: [...vitestOverrides, ...jestOverrides],
});
