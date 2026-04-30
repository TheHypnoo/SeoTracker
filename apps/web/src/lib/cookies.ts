export function getCookie(name: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function deleteCookie(name: string) {
  if (typeof document === 'undefined') {
    return;
  }
  const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  document.cookie = base;
  const host = window.location.hostname;
  if (host && host !== 'localhost') {
    document.cookie = `${base}; domain=${host}`;
    const parts = host.split('.');
    if (parts.length > 2) {
      document.cookie = `${base}; domain=.${parts.slice(-2).join('.')}`;
    }
  }
}
