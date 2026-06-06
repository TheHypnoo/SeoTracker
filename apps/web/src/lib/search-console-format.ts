export function formatSearchConsoleProperty(siteUrl: string) {
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.replace(/^sc-domain:/, '');
    return {
      compact: `Dominio completo · ${domain}`,
      primary: domain,
      raw: siteUrl,
      secondary: 'Dominio completo (incluye subdominios y http/https)',
    };
  }

  try {
    const url = new URL(siteUrl);
    return {
      compact: `URL prefix · ${url.host}`,
      primary: siteUrl,
      raw: siteUrl,
      secondary: 'Prefijo URL exacto',
    };
  } catch {
    return {
      compact: siteUrl,
      primary: siteUrl,
      raw: siteUrl,
      secondary: 'Propiedad Search Console',
    };
  }
}
