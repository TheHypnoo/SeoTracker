import type { Severity } from './audit-detail-types';

export function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const minutes = Math.round(diff / 60_000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `hace ${days} d`;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(value).toLocaleDateString('es-ES', options);
  } catch {
    return value;
  }
}

export function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return `${minutes} min ${remainder} s`;
}

export function formatMetricValue(num: number | null, text: string | null): string {
  if (num !== null && num !== undefined) {
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  }
  if (text) return text;
  return '--';
}

export function humanizeMetric(key: string): string {
  const labels: Record<string, string> = {
    crawl_candidates_found: 'URLs candidatas encontradas',
    crawl_confidence_level: 'Confianza del rastreo',
    crawl_confidence_score: 'Score de confianza',
    crawl_coverage_ratio: 'Cobertura del rastreo',
    crawl_success_ratio: 'Ratio de respuestas correctas',
  };
  if (labels[key]) return labels[key];
  return key.replaceAll(/[_-]+/g, ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

export function isRatioMetric(key: string): boolean {
  return key.endsWith('_ratio');
}

/**
 * Color tokens picked from the score: emerald (>=85), amber (>=65), rose (<65),
 * slate (null). Used by ScoreCard, CategoryScoreStrip and PageScorePill.
 */
export function scoreTone(score: number | null) {
  if (score === null) {
    return {
      text: 'text-slate-400',
      border: 'border-slate-200',
      bg: 'bg-slate-50',
      bar: 'bg-slate-300',
      caption: 'Score no disponible todavía.',
    };
  }
  if (score >= 85) {
    return {
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      bar: 'bg-emerald-500',
      caption: 'Excelente salud SEO técnica.',
    };
  }
  if (score >= 65) {
    return {
      text: 'text-amber-700',
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      bar: 'bg-amber-500',
      caption: 'Hay margen de mejora en áreas concretas.',
    };
  }
  return {
    text: 'text-rose-700',
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    bar: 'bg-rose-500',
    caption: 'Necesita atención: revisa las incidencias críticas.',
  };
}

/**
 * Per-severity color palette (chip / dot / surface / bar). Centralizing here
 * keeps the audit detail visually consistent across the chip, score breakdown
 * and severity reparto blocks.
 */
export function severityStyle(severity: Severity) {
  if (severity === 'CRITICAL') {
    return {
      chip: 'bg-rose-100 text-rose-700',
      dot: 'bg-rose-600',
      border: 'border-rose-200',
      surface: 'bg-rose-50',
      label: 'text-rose-700',
      value: 'text-rose-700',
      bar: 'bg-rose-500',
    };
  }
  if (severity === 'HIGH') {
    return {
      chip: 'bg-amber-100 text-amber-700',
      dot: 'bg-amber-600',
      border: 'border-amber-200',
      surface: 'bg-amber-50',
      label: 'text-amber-700',
      value: 'text-amber-700',
      bar: 'bg-amber-500',
    };
  }
  if (severity === 'MEDIUM') {
    return {
      chip: 'bg-sky-100 text-sky-700',
      dot: 'bg-sky-600',
      border: 'border-sky-200',
      surface: 'bg-sky-50',
      label: 'text-sky-700',
      value: 'text-sky-700',
      bar: 'bg-sky-500',
    };
  }
  return {
    chip: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-500',
    border: 'border-slate-200',
    surface: 'bg-slate-50',
    label: 'text-slate-600',
    value: 'text-slate-700',
    bar: 'bg-slate-400',
  };
}

export function severityLabel(severity: Severity): string {
  if (severity === 'CRITICAL') return 'Crítica';
  if (severity === 'HIGH') return 'Alta';
  if (severity === 'MEDIUM') return 'Media';
  return 'Baja';
}

export function httpStatusTone(
  status: number | null,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === null) return 'neutral';
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'warning';
  if (status >= 200) return 'success';
  return 'neutral';
}

export function httpStatusPillTone(status: number | null): string {
  if (status === null) return 'bg-slate-100 text-slate-500';
  if (status >= 500) return 'bg-rose-100 text-rose-700';
  if (status >= 400) return 'bg-amber-100 text-amber-700';
  if (status >= 300) return 'bg-sky-100 text-sky-700';
  if (status >= 200) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-500';
}
