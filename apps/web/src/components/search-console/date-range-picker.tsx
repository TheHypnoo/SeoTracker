import { Dialog } from '@base-ui/react';
import { DayPicker, type DateRange } from '@daypicker/react';
import { es } from '@daypicker/react/locale';
import '@daypicker/react/style.css';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import { Button } from '#/components/button';

import { daysAgo, formatCalendarLabel, formatDateOnly, parseDateOnly } from './format';

export const RANGE_PRESETS = [
  { days: 7, label: '7 días' },
  { days: 28, label: '28 días' },
  { days: 90, label: '90 días' },
] as const;

export function DateRangePickerButton({
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
