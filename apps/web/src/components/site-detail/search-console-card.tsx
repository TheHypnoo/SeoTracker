import { Dialog } from '@base-ui/react';
import { DayPicker, type DateRange } from '@daypicker/react';
import { es } from '@daypicker/react/locale';
import '@daypicker/react/style.css';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  DatabaseZap,
  Globe2,
  Link2,
  type LucideIcon,
  Monitor,
  MousePointerClick,
  Search,
  Smartphone,
  Tablet,
  Target,
  TrendingUp,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';

import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { Notice } from '#/components/notice';
import { QueryState } from '#/components/query-state';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { useToast } from '#/components/toast';
import { formatSearchConsoleProperty } from '#/lib/search-console-format';

import { useAuth } from '../../lib/auth-context';

type SearchConsoleProperty = {
  id: string;
  projectId: string;
  googleConnectionId: string;
  siteUrl: string;
  permissionLevel: string;
  verified: boolean;
  lastSyncedAt: string;
};

type LinkedProperty = {
  siteId: string;
  active: boolean;
  linkedAt: string;
  linkedByUserId: string;
  property: SearchConsoleProperty;
  updatedAt: string;
};

type CandidateProperty = SearchConsoleProperty & {
  match: 'domain-property' | 'exact-url-prefix' | 'www-url-prefix' | 'related' | 'none';
};

type CandidatesResponse = {
  linked: LinkedProperty | null;
  recommendedPropertyId: string | null;
  site: { id: string; projectId: string; domain: string; normalizedDomain: string };
  properties: CandidateProperty[];
};

type PerformanceSummary = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type TopPerformanceRow = {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type ImportResponse = {
  importedRows: number;
  startDate: string;
  endDate: string;
};

const MATCH_LABELS: Record<CandidateProperty['match'], string> = {
  'domain-property': 'Dominio completo',
  'exact-url-prefix': 'URL exacta',
  'www-url-prefix': 'WWW',
  none: 'Sin coincidencia',
  related: 'Relacionada',
};

const INTEGER_FORMATTER = new Intl.NumberFormat('es-ES');
const PERCENT_FORMATTER = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
  style: 'percent',
});
const DECIMAL_FORMATTER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const CANDIDATES_LOADING = <Skeleton className="h-28 w-full" />;
const RANGE_PRESETS = [
  { days: 7, label: '7 días' },
  { days: 28, label: '28 días' },
  { days: 90, label: '90 días' },
] as const;
const COUNTRY_ALPHA3_TO_ALPHA2: Record<string, string> = {
  AND: 'AD',
  ARE: 'AE',
  ARG: 'AR',
  AUS: 'AU',
  AUT: 'AT',
  BEL: 'BE',
  BGR: 'BG',
  BRA: 'BR',
  CAN: 'CA',
  CHE: 'CH',
  CHL: 'CL',
  CHN: 'CN',
  COL: 'CO',
  CZE: 'CZ',
  DEU: 'DE',
  DNK: 'DK',
  DOM: 'DO',
  ECU: 'EC',
  EGY: 'EG',
  ESP: 'ES',
  FIN: 'FI',
  FRA: 'FR',
  GBR: 'GB',
  GRC: 'GR',
  HKG: 'HK',
  HRV: 'HR',
  HUN: 'HU',
  IDN: 'ID',
  IND: 'IN',
  IRL: 'IE',
  ISR: 'IL',
  ITA: 'IT',
  JPN: 'JP',
  KOR: 'KR',
  LTU: 'LT',
  LUX: 'LU',
  LVA: 'LV',
  MAR: 'MA',
  MEX: 'MX',
  NLD: 'NL',
  NOR: 'NO',
  NZL: 'NZ',
  PER: 'PE',
  POL: 'PL',
  PRT: 'PT',
  ROU: 'RO',
  RUS: 'RU',
  SAU: 'SA',
  SGP: 'SG',
  SVK: 'SK',
  SVN: 'SI',
  SWE: 'SE',
  TUR: 'TR',
  UKR: 'UA',
  URY: 'UY',
  USA: 'US',
  VEN: 'VE',
  ZAF: 'ZA',
};
const COUNTRY_NAMES = new Intl.DisplayNames(['es'], { type: 'region' });

export function SearchConsoleCard({ siteId }: { siteId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const { defaultStartDate, defaultEndDate } = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const candidatesKey = ['search-console-candidates', siteId] as const;
  const summaryKey = ['search-console-summary', siteId, startDate, endDate] as const;
  const topQueriesKey = ['search-console-top-queries', siteId, startDate, endDate] as const;
  const topPagesKey = ['search-console-top-pages', siteId, startDate, endDate] as const;
  const topCountriesKey = ['search-console-top-countries', siteId, startDate, endDate] as const;
  const topDevicesKey = ['search-console-top-devices', siteId, startDate, endDate] as const;

  const candidates = useQuery({
    queryKey: candidatesKey,
    queryFn: () => auth.api.get<CandidatesResponse>(`/sites/${siteId}/search-console/candidates`),
    enabled: Boolean(auth.accessToken && siteId),
  });

  const linked = candidates.data?.linked ?? null;
  const hasLink = Boolean(linked);
  const selectedCandidate = candidates.data?.properties.find(
    (property) => property.id === selectedPropertyId && isLinkableProperty(property),
  );
  const recommendedCandidate = candidates.data?.properties.find(
    (property) =>
      property.id === candidates.data?.recommendedPropertyId && isLinkableProperty(property),
  );
  const fallbackCandidate = candidates.data?.properties.find(isLinkableProperty);
  const activePropertyId =
    selectedCandidate?.id ?? recommendedCandidate?.id ?? fallbackCandidate?.id ?? '';

  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: () =>
      auth.api.get<PerformanceSummary>(
        `/sites/${siteId}/search-console/performance/summary?${rangeParams(startDate, endDate)}`,
      ),
    enabled: Boolean(auth.accessToken && siteId && hasLink),
    placeholderData: keepPreviousData,
  });

  const topQueries = useQuery({
    queryKey: topQueriesKey,
    queryFn: () =>
      auth.api.get<TopPerformanceRow[]>(
        `/sites/${siteId}/search-console/performance/top-queries?${rangeParams(startDate, endDate)}&limit=5`,
      ),
    enabled: Boolean(auth.accessToken && siteId && hasLink),
    placeholderData: keepPreviousData,
  });

  const topPages = useQuery({
    queryKey: topPagesKey,
    queryFn: () =>
      auth.api.get<TopPerformanceRow[]>(
        `/sites/${siteId}/search-console/performance/top-pages?${rangeParams(startDate, endDate)}&limit=5`,
      ),
    enabled: Boolean(auth.accessToken && siteId && hasLink),
    placeholderData: keepPreviousData,
  });

  const topCountries = useQuery({
    queryKey: topCountriesKey,
    queryFn: () =>
      auth.api.get<TopPerformanceRow[]>(
        `/sites/${siteId}/search-console/performance/top-countries?${rangeParams(startDate, endDate)}&limit=5`,
      ),
    enabled: Boolean(auth.accessToken && siteId && hasLink),
    placeholderData: keepPreviousData,
  });

  const topDevices = useQuery({
    queryKey: topDevicesKey,
    queryFn: () =>
      auth.api.get<TopPerformanceRow[]>(
        `/sites/${siteId}/search-console/performance/top-devices?${rangeParams(startDate, endDate)}&limit=5`,
      ),
    enabled: Boolean(auth.accessToken && siteId && hasLink),
    placeholderData: keepPreviousData,
  });

  const linkProperty = useMutation({
    mutationFn: (searchConsolePropertyId: string) =>
      auth.api.post(`/sites/${siteId}/search-console/link`, { searchConsolePropertyId }),
    onSuccess: async () => {
      toast.success('Propiedad vinculada', 'Ya puedes importar datos de Search Console.');
      await queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });

  const unlinkProperty = useMutation({
    mutationFn: () => auth.api.delete(`/sites/${siteId}/search-console/link`),
    onSuccess: async () => {
      toast.success('Propiedad desvinculada');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: candidatesKey }),
        queryClient.invalidateQueries({ queryKey: ['search-console-summary', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['search-console-top-queries', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['search-console-top-pages', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['search-console-top-countries', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['search-console-top-devices', siteId] }),
      ]);
    },
  });

  const importPerformance = useMutation({
    mutationFn: () =>
      auth.api.post<ImportResponse>(`/sites/${siteId}/search-console/performance/import`, {
        endDate,
        startDate,
      }),
    onSuccess: async (result) => {
      toast.success('Datos importados', `${result.importedRows} filas actualizadas.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: summaryKey }),
        queryClient.invalidateQueries({ queryKey: topQueriesKey }),
        queryClient.invalidateQueries({ queryKey: topPagesKey }),
        queryClient.invalidateQueries({ queryKey: topCountriesKey }),
        queryClient.invalidateQueries({ queryKey: topDevicesKey }),
      ]);
    },
    onError: (error) => {
      toast.error(
        'No se pudo importar GSC',
        error instanceof Error ? error.message : 'Revisa la conexión con Google Search Console.',
      );
    },
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Search size={17} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                Google Search Console
              </h2>
              <p className="text-xs leading-5 text-slate-500">
                Performance orgánico por query, URL, país y dispositivo.
              </p>
            </div>
            <Badge tone={linked ? 'success' : 'neutral'}>
              {linked ? 'Vinculado' : 'Sin vincular'}
            </Badge>
          </div>
        </div>
        {linked ? (
          <ConfirmUnlinkButton
            loading={unlinkProperty.isPending}
            onClick={() => unlinkProperty.mutate()}
          />
        ) : null}
      </div>

      <div className="mt-4">
        <QueryState
          status={candidates.status}
          data={candidates.data}
          error={candidates.error}
          onRetry={() => candidates.refetch()}
          loading={CANDIDATES_LOADING}
        >
          {(data) => (
            <div className="space-y-4">
              {data.linked ? (
                <LinkedPropertyBanner linked={data.linked} />
              ) : data.properties.length > 0 ? (
                <PropertyLinkPanel
                  data={data}
                  activePropertyId={activePropertyId}
                  selectedPropertyId={selectedPropertyId}
                  onSelectProperty={setSelectedPropertyId}
                  linkPending={linkProperty.isPending}
                  onLink={(propertyId) => linkProperty.mutate(propertyId)}
                />
              ) : (
                <Notice tone="warning">
                  No hay propiedades sincronizadas para este proyecto. Ve a Configuración &gt;
                  Integraciones, conecta Google y pulsa “Sincronizar”.
                </Notice>
              )}

              {data.linked ? (
                <PerformancePanel
                  startDate={startDate}
                  endDate={endDate}
                  setStartDate={setStartDate}
                  setEndDate={setEndDate}
                  summary={summary.data}
                  summaryLoading={summary.isLoading && !summary.data}
                  refreshing={
                    summary.isFetching ||
                    topQueries.isFetching ||
                    topPages.isFetching ||
                    topCountries.isFetching ||
                    topDevices.isFetching
                  }
                  topQueries={topQueries.data ?? []}
                  topPages={topPages.data ?? []}
                  topCountries={topCountries.data ?? []}
                  topDevices={topDevices.data ?? []}
                  importPending={importPerformance.isPending}
                  onImport={() => importPerformance.mutate()}
                />
              ) : null}
            </div>
          )}
        </QueryState>
      </div>
    </section>
  );
}

function ConfirmUnlinkButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={loading}
      >
        Desvincular
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none">
          <Dialog.Title className="text-lg font-black text-slate-950">
            Desvincular Search Console
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-slate-500">
            SeoTracker dejará de importar datos GSC para este dominio hasta que vuelvas a vincular
            una propiedad.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              Cancelar
            </Dialog.Close>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              onClick={() => {
                onClick();
                setOpen(false);
              }}
            >
              Desvincular
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PropertyLinkPanel({
  data,
  activePropertyId,
  selectedPropertyId,
  onSelectProperty,
  linkPending,
  onLink,
}: {
  data: CandidatesResponse;
  activePropertyId: string;
  selectedPropertyId: string;
  onSelectProperty: (propertyId: string) => void;
  linkPending: boolean;
  onLink: (propertyId: string) => void;
}) {
  const onlyProperty = data.properties.length === 1 ? data.properties[0] : null;
  const selectedProperty =
    data.properties.find((property) => property.id === (selectedPropertyId || activePropertyId)) ??
    null;

  if (onlyProperty) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <GscPropertySummary property={onlyProperty} />
          <Button
            type="button"
            size="sm"
            disabled={!isLinkableProperty(onlyProperty)}
            loading={linkPending}
            onClick={() => isLinkableProperty(onlyProperty) && onLink(onlyProperty.id)}
          >
            <Link2 size={14} aria-hidden="true" />
            Vincular
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-950">Propiedad GSC</h3>
        <Badge tone="brand">{data.properties.length} propiedades</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <SelectInput
          label="Propiedad"
          value={activePropertyId}
          onValueChange={onSelectProperty}
          options={data.properties.map((property) => ({
            value: property.id,
            disabled: !isLinkableProperty(property),
            label: (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-xs">
                  {formatSearchConsoleProperty(property.siteUrl).compact}
                </span>
                <span className="text-[11px] text-slate-500">{propertyLabel(property)}</span>
              </span>
            ),
          }))}
        />
        <Button
          type="button"
          size="sm"
          disabled={!selectedProperty || !isLinkableProperty(selectedProperty)}
          loading={linkPending}
          onClick={() =>
            selectedProperty && isLinkableProperty(selectedProperty) && onLink(selectedProperty.id)
          }
        >
          <Link2 size={14} aria-hidden="true" />
          Vincular
        </Button>
      </div>
    </div>
  );
}

function GscPropertySummary({ property }: { property: CandidateProperty }) {
  const display = formatSearchConsoleProperty(property.siteUrl);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all text-sm font-bold text-slate-900">{display.primary}</span>
        <Badge tone={property.verified ? 'success' : 'warning'}>
          {property.verified ? 'Verificada' : 'No verificada'}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {propertyLabel(property)} · {property.permissionLevel}
      </div>
    </div>
  );
}

function isLinkableProperty(property: CandidateProperty) {
  return property.verified && property.match !== 'none';
}

function propertyLabel(property: CandidateProperty) {
  if (!property.verified) {
    return `${MATCH_LABELS[property.match]} · no verificada`;
  }
  if (property.match === 'none') {
    return 'No cubre este dominio';
  }
  return `${MATCH_LABELS[property.match]} · verificada`;
}

function LinkedPropertyBanner({ linked }: { linked: LinkedProperty }) {
  const display = formatSearchConsoleProperty(linked.property.siteUrl);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <Badge tone="success">GSC</Badge>
        <span className="break-all font-semibold text-slate-900">{display.primary}</span>
        <span className="text-slate-400">·</span>
        <span className="text-xs font-medium text-slate-500">
          {linked.property.permissionLevel}
        </span>
      </div>
    </div>
  );
}

function PerformancePanel({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  summary,
  summaryLoading,
  topQueries,
  topPages,
  topCountries,
  topDevices,
  importPending,
  refreshing,
  onImport,
}: {
  startDate: string;
  endDate: string;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  summary: PerformanceSummary | undefined;
  summaryLoading: boolean;
  topQueries: TopPerformanceRow[];
  topPages: TopPerformanceRow[];
  topCountries: TopPerformanceRow[];
  topDevices: TopPerformanceRow[];
  importPending: boolean;
  refreshing: boolean;
  onImport: () => void;
}) {
  const dateRangeValid = isDateOnly(startDate) && isDateOnly(endDate) && startDate <= endDate;
  const activePreset = RANGE_PRESETS.find(
    (preset) => endDate === daysAgo(3) && startDate === daysBefore(endDate, preset.days - 1),
  );

  const setPresetRange = (days: number) => {
    const presetEndDate = daysAgo(3);
    setStartDate(daysBefore(presetEndDate, days - 1));
    setEndDate(presetEndDate);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays size={15} className="text-brand-500" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-950">Periodo de análisis</h3>
              {refreshing ? <Badge tone="neutral">Actualizando</Badge> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.days}
                onClick={() => setPresetRange(preset.days)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                  activePreset?.days === preset.days
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,18rem)_auto] md:items-end md:justify-start">
          <DateRangePickerButton
            startDate={startDate}
            endDate={endDate}
            onApply={(range) => {
              setStartDate(range.startDate);
              setEndDate(range.endDate);
            }}
          />
          <Button
            type="button"
            loading={importPending}
            disabled={!dateRangeValid}
            onClick={onImport}
          >
            <DatabaseZap size={14} aria-hidden="true" />
            Importar GSC
          </Button>
        </div>
      </div>

      {summaryLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Clicks"
            value={formatNumber(summary?.clicks ?? 0)}
            icon={MousePointerClick}
          />
          <Metric
            label="Impresiones"
            value={formatNumber(summary?.impressions ?? 0)}
            icon={TrendingUp}
          />
          <Metric label="CTR" value={formatPercent(summary?.ctr ?? 0)} icon={Target} />
          <Metric
            label="Posición"
            value={formatPosition(summary?.position ?? 0)}
            icon={BarChart3}
          />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <TopList
          title="Top queries"
          rows={topQueries}
          empty="Sin queries importadas."
          icon={Search}
        />
        <TopList title="Top URLs" rows={topPages} empty="Sin URLs importadas." icon={Globe2} />
        <TopList
          title="Top países"
          rows={topCountries}
          empty="Sin países importados."
          valueFormatter={formatCountry}
          valuePrefix={(value) => <CountryFlag countryCode={value} />}
          icon={Globe2}
        />
        <TopList
          title="Top dispositivos"
          rows={topDevices}
          empty="Sin dispositivos importados."
          valueFormatter={formatDevice}
          valuePrefix={(value) => <DeviceIcon device={value} />}
          icon={BarChart3}
        />
      </div>
    </div>
  );
}

function DateRangePickerButton({
  startDate,
  endDate,
  onApply,
}: {
  startDate: string;
  endDate: string;
  onApply: (range: { startDate: string; endDate: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => ({
    from: parseDateOnly(startDate),
    to: parseDateOnly(endDate),
  }));
  const applyDisabled = !(draftRange?.from && draftRange.to);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftRange({ from: parseDateOnly(startDate), to: parseDateOnly(endDate) });
    }
  };

  const handleApply = () => {
    if (!(draftRange?.from && draftRange.to)) {
      return;
    }
    onApply({ endDate: formatDateOnly(draftRange.to), startDate: formatDateOnly(draftRange.from) });
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        type="button"
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 transition hover:border-brand-200 hover:bg-brand-subtle focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label="Seleccionar periodo de análisis"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays size={15} className="shrink-0 text-brand-500" aria-hidden="true" />
          <span className="truncate font-semibold">
            {formatCalendarLabel(startDate)} — {formatCalendarLabel(endDate)}
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
          <div className="border-b border-slate-200 px-5 py-4">
            <Dialog.Title className="text-lg font-black text-slate-950">
              Seleccionar periodo
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              Elige un rango para consultar e importar datos de Google Search Console.
            </Dialog.Description>
          </div>
          <div className="p-4">
            <DayPicker
              animate
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              locale={es}
              weekStartsOn={1}
              numberOfMonths={2}
              captionLayout="dropdown"
              disabled={{ after: parseDateOnly(daysAgo(1)) }}
              className="seotracker-day-picker"
              classNames={{
                day_button:
                  'rdp-day_button rounded-lg font-semibold transition hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                month_caption: 'rdp-month_caption text-sm font-black text-slate-950',
                today: 'rdp-today text-brand-700',
                weekday:
                  'rdp-weekday text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400',
              }}
              styles={{
                root: {
                  '--rdp-accent-background-color': '#eef2ff',
                  '--rdp-accent-color': '#1d4ed8',
                  '--rdp-day_button-border-radius': '0.65rem',
                  '--rdp-range_middle-background-color': '#eef2ff',
                } as CSSProperties,
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-sm font-semibold text-slate-700">
              {draftRange?.from ? formatCalendarLabel(formatDateOnly(draftRange.from)) : 'Inicio'} —{' '}
              {draftRange?.to ? formatCalendarLabel(formatDateOnly(draftRange.to)) : 'Fin'}
            </div>
            <div className="flex gap-2">
              <Dialog.Close
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                Cancelar
              </Dialog.Close>
              <Button type="button" disabled={applyDisabled} onClick={handleApply}>
                Aplicar rango
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="grid size-6 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={13} aria-hidden="true" />
        </span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function TopList({
  title,
  rows,
  empty,
  valueFormatter = (value) => value,
  valuePrefix,
  icon: Icon,
}: {
  title: string;
  rows: TopPerformanceRow[];
  empty: string;
  valueFormatter?: (value: string) => string;
  valuePrefix?: (value: string) => ReactNode;
  icon: LucideIcon;
}) {
  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          <Icon size={14} className="text-brand-500" aria-hidden="true" />
          {title}
        </h3>
        {rows.length > 0 ? <Badge tone="neutral">{rows.length}</Badge> : null}
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.value} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="flex min-w-0 items-center gap-2 truncate text-xs font-bold text-slate-900"
                    title={row.value}
                  >
                    {valuePrefix ? valuePrefix(row.value) : null}
                    <span className="truncate">{valueFormatter(row.value)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>{formatNumber(row.clicks)} clicks</span>
                    <span>{formatNumber(row.impressions)} impr.</span>
                    <span>{formatPercent(row.ctr)} CTR</span>
                    <span>{formatPosition(row.position)} pos.</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-black tabular-nums text-slate-900">
                  {formatNumber(row.clicks)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max((row.clicks / maxClicks) * 100, 6)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function defaultDateRange() {
  const end = daysAgo(3);
  return { defaultEndDate: end, defaultStartDate: daysBefore(end, 27) };
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysBefore(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function rangeParams(startDate: string, endDate: string) {
  const params = new URLSearchParams({ endDate, startDate });
  return params.toString();
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function parseDateOnly(value: string) {
  const [year = '0', month = '1', day = '1'] = value.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCalendarLabel(value: string) {
  return CALENDAR_DATE_FORMATTER.format(parseDateOnly(value));
}

function formatNumber(value: number) {
  return INTEGER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  return PERCENT_FORMATTER.format(value);
}

function formatPosition(value: number) {
  return DECIMAL_FORMATTER.format(value);
}

function formatCountry(value: string) {
  const alpha2 = COUNTRY_ALPHA3_TO_ALPHA2[value.toUpperCase()];
  return alpha2 ? (COUNTRY_NAMES.of(alpha2) ?? value.toUpperCase()) : value.toUpperCase();
}

function formatDevice(value: string) {
  const labels: Record<string, string> = {
    DESKTOP: 'Desktop',
    MOBILE: 'Móvil',
    TABLET: 'Tablet',
  };
  return labels[value.toUpperCase()] ?? value;
}

function CountryFlag({ countryCode }: { countryCode: string }) {
  const alpha2 = COUNTRY_ALPHA3_TO_ALPHA2[countryCode.toUpperCase()];
  if (!alpha2) {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] text-slate-500">
        {countryCode.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-base shadow-sm ring-1 ring-slate-200">
      {alpha2ToFlag(alpha2)}
    </span>
  );
}

function DeviceIcon({ device }: { device: string }) {
  const normalizedDevice = device.toUpperCase();
  const Icon =
    normalizedDevice === 'MOBILE' ? Smartphone : normalizedDevice === 'TABLET' ? Tablet : Monitor;
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

function alpha2ToFlag(alpha2: string) {
  return [...alpha2.toUpperCase()]
    .map((char) => String.fromCodePoint(127_397 + (char.codePointAt(0) ?? 0)))
    .join('');
}
