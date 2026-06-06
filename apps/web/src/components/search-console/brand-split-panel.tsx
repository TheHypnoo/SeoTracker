import { Tag } from 'lucide-react';

import { Badge } from '#/components/badge';
import { TextInput } from '#/components/text-input';

import { formatNumber, formatPercent, formatPosition } from './format';
import type { BrandSplit } from './types';

/**
 * Branded vs non-branded breakdown. The user supplies brand terms (persisted per site); queries
 * containing any term count as branded. Helps separate demand the brand already owns from the
 * generic traffic SEO is really winning.
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
        {hasTerms && data ? (
          <Badge tone="brand">{formatPercent(brandedShare)} de marca</Badge>
        ) : null}
      </div>

      <div className="mt-3 max-w-md">
        <TextInput
          value={terms}
          onChange={(event) => onChangeTerms(event.target.value)}
          placeholder="Términos de marca separados por comas, p. ej. nike, air max"
          aria-label="Términos de marca"
        />
        <p className="mt-1 text-[11px] text-slate-400">
          Las consultas que contengan alguno de estos términos cuentan como marca.
        </p>
      </div>

      {!hasTerms ? null : loading && !data ? (
        <div className="mt-4 h-24 w-full animate-pulse rounded-xl bg-slate-100" />
      ) : data ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <BrandColumn title="Marca" tone="brand" bucket={data.branded} />
          <BrandColumn title="Genérico" tone="neutral" bucket={data.nonBranded} />
        </div>
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
