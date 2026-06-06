import { Pencil, Tag } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { TextInput } from '#/components/text-input';

import { formatNumber, formatPercent, formatPosition } from './format';
import type { BrandSplit } from './types';

/**
 * Branded vs non-branded breakdown. Queries containing any of the user's brand terms count as
 * branded. The terms editor is collapsed by default so the panel reads as data, not configuration:
 * it shows the split (or a short prompt) and reveals the input only when editing.
 */
export function BrandSplitPanel({
  terms,
  onChangeTerms,
  data,
  loading,
}: {
  terms: string;
  onChangeTerms: (value: string) => void;
  data: BrandSplit | undefined;
  loading: boolean;
}) {
  const hasTerms = terms.trim().length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(terms);

  const openEditor = () => {
    setDraft(terms);
    setEditing(true);
  };

  const apply = () => {
    onChangeTerms(draft.trim());
    setEditing(false);
  };

  const brandedClicks = data?.branded.clicks ?? 0;
  const totalClicks = brandedClicks + (data?.nonBranded.clicks ?? 0);
  const brandedShare = totalClicks === 0 ? 0 : brandedClicks / totalClicks;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          <Tag size={14} className="text-brand-500" aria-hidden="true" />
          Marca vs genérico
        </h3>
        <div className="flex items-center gap-2">
          {hasTerms && data && !editing ? (
            <Badge tone="brand">{formatPercent(brandedShare)} de marca</Badge>
          ) : null}
          {editing ? null : (
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              <Pencil size={12} aria-hidden="true" />
              {hasTerms ? 'Editar marca' : 'Configurar'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 max-w-lg">
          <TextInput
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Términos de marca separados por comas, p. ej. nike, air max"
            aria-label="Términos de marca"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" onClick={apply}>
              Aplicar
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Las consultas que contengan alguno de estos términos cuentan como marca.
          </p>
        </div>
      ) : !hasTerms ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Define los términos de tu marca para separar el tráfico que ya te busca por nombre del que
          ganas con SEO genérico.
        </p>
      ) : loading && !data ? (
        <div className="mt-4 h-24 w-full animate-pulse rounded-xl bg-slate-100" />
      ) : data ? (
        <>
          <p className="mt-3 text-[11px] text-slate-400">
            Marca: <span className="font-semibold text-slate-600">{terms}</span>
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <BrandColumn title="Marca" tone="brand" bucket={data.branded} />
            <BrandColumn title="Genérico" tone="neutral" bucket={data.nonBranded} />
          </div>
        </>
      ) : null}
    </section>
  );
}

function BrandColumn({
  title,
  tone,
  bucket,
}: {
  title: string;
  tone: 'brand' | 'neutral';
  bucket: BrandSplit['branded'];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{title}</span>
        <Badge tone={tone}>{formatNumber(bucket.clicks)} clicks</Badge>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Impresiones" value={formatNumber(bucket.impressions)} />
        <Stat label="CTR" value={formatPercent(bucket.ctr)} />
        <Stat label="Posición" value={formatPosition(bucket.position)} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </dt>
      <dd className="text-sm font-black tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
