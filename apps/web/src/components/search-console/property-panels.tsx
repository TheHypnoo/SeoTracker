import { Dialog } from '@base-ui/react';
import { Link2 } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { SelectInput } from '#/components/select-input';
import { formatSearchConsoleProperty } from '#/lib/search-console-format';

import type {
  CandidateMatch,
  CandidateProperty,
  CandidatesResponse,
  LinkedProperty,
} from './types';

const MATCH_LABELS: Record<CandidateMatch, string> = {
  'domain-property': 'Dominio completo',
  'exact-url-prefix': 'URL exacta',
  'www-url-prefix': 'WWW',
  none: 'Sin coincidencia',
  related: 'Relacionada',
};

export function isLinkableProperty(property: CandidateProperty) {
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

export function LinkedPropertyBanner({ linked }: { linked: LinkedProperty }) {
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

export function PropertyLinkPanel({
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

export function ConfirmUnlinkButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
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
