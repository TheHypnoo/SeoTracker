export function formatDisplayDateTime(value: string, locale = 'es-ES') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(locale);
}

export function formatDisplayDate(value: string, locale = 'es-ES') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(locale);
}

export function formatShortDate(value: string, locale = 'es-ES') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

export function formatCompactDateTime(value: string, locale = 'es-ES') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function formatNumericDate(value: string, locale = 'es-ES') {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
}

export function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
