import { Menu as BaseMenu } from '@base-ui/react';
import {
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  ListChecks,
  SearchCheck,
} from 'lucide-react';

import type { ExportKind } from './audit-detail-types';

export function ExportMenu({
  onSelect,
  disabled,
}: {
  onSelect: (kind: ExportKind) => void;
  disabled?: boolean;
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        disabled={disabled}
        className="btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
      >
        <Download size={14} aria-hidden="true" />
        Exportar
        <ChevronDown size={14} aria-hidden="true" />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={8} align="end" className="z-50">
          <BaseMenu.Popup className="min-w-[18rem] rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <BaseMenu.Item
              onClick={() => onSelect('ACTION_PLAN')}
              className="flex cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50"
            >
              <ListChecks size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Plan de acción</div>
                <div className="text-xs text-slate-500">
                  Prioridades, impacto, esfuerzo, evidencias y acciones recomendadas
                </div>
              </div>
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={() => onSelect('INDEXABILITY')}
              className="flex cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50"
            >
              <SearchCheck
                size={16}
                className="mt-0.5 shrink-0 text-slate-500"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Indexabilidad</div>
                <div className="text-xs text-slate-500">
                  Matriz por URL con status, sitemap, robots, canonical e interpretación
                </div>
              </div>
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={() => onSelect('AUDIT_RESULT')}
              className="flex cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50"
            >
              <FileJson size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Informe completo</div>
                <div className="text-xs text-slate-500">
                  Score, issues, métricas, páginas, acciones e indexabilidad
                </div>
              </div>
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={() => onSelect('ISSUES')}
              className="flex cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50"
            >
              <FileSpreadsheet
                size={16}
                className="mt-0.5 shrink-0 text-slate-500"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Solo incidencias</div>
                <div className="text-xs text-slate-500">
                  Listado de issues detectadas con severidad y URL (CSV)
                </div>
              </div>
            </BaseMenu.Item>
            <BaseMenu.Item
              onClick={() => onSelect('METRICS')}
              className="flex cursor-default items-start gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 outline-none transition data-[highlighted]:bg-slate-50"
            >
              <FileText size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">Solo métricas</div>
                <div className="text-xs text-slate-500">
                  Métricas SEO numéricas (title length, h1 count, etc.) en CSV
                </div>
              </div>
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
