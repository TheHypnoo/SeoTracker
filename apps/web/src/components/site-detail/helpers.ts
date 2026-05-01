import type { ApiClient } from '../../lib/api-client';
import type { AuditRun, Schedule } from './types';

export const DAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function describeSchedule(schedule: Schedule): string {
  const time = schedule.timeOfDay;
  const tz = schedule.timezone;
  if (schedule.frequency === 'DAILY') {
    return `Diaria a las ${time} · ${tz}`;
  }
  const day = DAY_LABELS[(schedule.dayOfWeek ?? 1) % 7] ?? 'Lunes';
  return `Los ${day.toLowerCase()} a las ${time} · ${tz}`;
}

export function statusLabel(status: string | null) {
  if (status === 'COMPLETED') {
    return 'Completado';
  }
  if (status === 'RUNNING') {
    return 'Ejecutando';
  }
  if (status === 'FAILED') {
    return 'Error';
  }
  if (status === 'QUEUED') {
    return 'En cola';
  }
  return 'Sin datos';
}

export function statusTone(status: string | null) {
  if (status === 'COMPLETED') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (status === 'RUNNING') {
    return 'bg-sky-100 text-sky-700';
  }
  if (status === 'FAILED') {
    return 'bg-rose-100 text-rose-700';
  }
  if (status === 'QUEUED') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-slate-100 text-slate-500';
}

export function scoreTone(score: number | null) {
  if (score === null) {
    return 'text-slate-400';
  }
  if (score >= 85) {
    return 'text-emerald-600';
  }
  if (score >= 65) {
    return 'text-amber-600';
  }
  return 'text-rose-600';
}

export function scoreBg(score: number | null) {
  if (score === null) {
    return 'bg-slate-100';
  }
  if (score >= 85) {
    return 'bg-emerald-50';
  }
  if (score >= 65) {
    return 'bg-amber-50';
  }
  return 'bg-rose-50';
}

export function triggerLabel(trigger: AuditRun['trigger']) {
  if (trigger === 'MANUAL') {
    return 'Manual';
  }
  if (trigger === 'SCHEDULED') {
    return 'Programada';
  }
  return 'Webhook';
}

export async function downloadExport(api: ApiClient, exportId: string, fileName: string | null) {
  const blob = await api.getBlob(`/exports/${exportId}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName ?? `export-${exportId}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
