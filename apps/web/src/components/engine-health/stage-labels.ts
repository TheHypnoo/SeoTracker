/**
 * Human labels and chart colors for the SEO engine pipeline stages emitted into
 * `audit_engine_telemetry`. Centralized so the per-audit waterfall and the
 * aggregate dashboard stay consistent. Unknown stages degrade to a title-cased
 * fallback so new engine stages render sensibly without a code change.
 */
const STAGE_LABELS: Record<string, string> = {
  homepage_fetch: 'Descarga de portada',
  html_analysis: 'Análisis HTML',
  blog_content_checks: 'Análisis de contenido',
  site_discovery: 'Descubrimiento (robots/sitemap)',
  link_graph: 'Grafo de enlaces',
  crawl_pages: 'Rastreo de páginas',
  crawl_confidence: 'Confianza del rastreo',
  cross_page_checks: 'Comprobaciones entre páginas',
  indexability_matrix: 'Matriz de indexabilidad',
  scoring: 'Cálculo de score',
};

export function humanizeStage(stage: string): string {
  return (
    STAGE_LABELS[stage] ?? stage.replaceAll(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Stable palette used to color the per-stage series in the trend chart. */
const STAGE_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
];

export function stageColor(index: number): string {
  return STAGE_PALETTE[index % STAGE_PALETTE.length] ?? '#64748b';
}
