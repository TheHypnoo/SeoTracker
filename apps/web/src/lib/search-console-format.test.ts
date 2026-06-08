import { describe, expect, it } from 'vitest';

import { formatSearchConsoleProperty } from './search-console-format';

describe(formatSearchConsoleProperty, () => {
  it('formats domain properties with a dedicated explanation', () => {
    expect(formatSearchConsoleProperty('sc-domain:example.com')).toStrictEqual({
      compact: 'Dominio completo · example.com',
      primary: 'example.com',
      raw: 'sc-domain:example.com',
      secondary: 'Dominio completo (incluye subdominios y http/https)',
    });
  });

  it('formats URL-prefix properties from valid URLs', () => {
    expect(formatSearchConsoleProperty('https://www.example.com/blog')).toStrictEqual({
      compact: 'URL prefix · www.example.com',
      primary: 'https://www.example.com/blog',
      raw: 'https://www.example.com/blog',
      secondary: 'Prefijo URL exacto',
    });
  });

  it('falls back gracefully for unknown property shapes', () => {
    expect(formatSearchConsoleProperty('example-property')).toStrictEqual({
      compact: 'example-property',
      primary: 'example-property',
      raw: 'example-property',
      secondary: 'Propiedad Search Console',
    });
  });
});
