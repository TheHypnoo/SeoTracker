/**
 * Color of the activity-feed bullet, picked from the event kind string.
 * The backend sends free-form `kind` values like "audit.completed" or
 * "audit.failed.critical"; we substring-match to keep the UI permissive.
 */
export function activityDot(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes('fail') || k.includes('error') || k.includes('critical')) {
    return 'bg-rose-500';
  }
  if (k.includes('regression')) return 'bg-amber-500';
  if (k.includes('complete') || k.includes('success')) return 'bg-emerald-500';
  if (k.includes('invite') || k.includes('member')) return 'bg-indigo-500';
  return 'bg-sky-500';
}

export function statusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Completado';
  if (status === 'RUNNING') return 'Ejecutando';
  if (status === 'FAILED') return 'Error';
  return 'En cola';
}

export function statusTone(status: string): 'success' | 'info' | 'danger' | 'warning' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING') return 'info';
  if (status === 'FAILED') return 'danger';
  return 'warning';
}
