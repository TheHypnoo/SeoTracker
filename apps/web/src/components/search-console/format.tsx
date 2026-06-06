import { Monitor, Smartphone, Tablet } from 'lucide-react';

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
const COUNTRY_NAMES = new Intl.DisplayNames(['es'], { type: 'region' });

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

export function formatNumber(value: number) {
  return INTEGER_FORMATTER.format(value);
}

export function formatPercent(value: number) {
  return PERCENT_FORMATTER.format(value);
}

export function formatPosition(value: number) {
  return DECIMAL_FORMATTER.format(value);
}

export function formatCountry(value: string) {
  const alpha2 = COUNTRY_ALPHA3_TO_ALPHA2[value.toUpperCase()];
  return alpha2 ? (COUNTRY_NAMES.of(alpha2) ?? value.toUpperCase()) : value.toUpperCase();
}

export function formatDevice(value: string) {
  const labels: Record<string, string> = {
    DESKTOP: 'Desktop',
    MOBILE: 'Móvil',
    TABLET: 'Tablet',
  };
  return labels[value.toUpperCase()] ?? value;
}

export function formatCalendarLabel(value: string) {
  return CALENDAR_DATE_FORMATTER.format(parseDateOnly(value));
}

export function CountryFlag({ countryCode }: { countryCode: string }) {
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

export function DeviceIcon({ device }: { device: string }) {
  const normalizedDevice = device.toUpperCase();
  const Icon =
    normalizedDevice === 'MOBILE' ? Smartphone : normalizedDevice === 'TABLET' ? Tablet : Monitor;
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function daysBefore(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function defaultDateRange() {
  const end = daysAgo(3);
  return { defaultEndDate: end, defaultStartDate: daysBefore(end, 27) };
}

export function rangeParams(startDate: string, endDate: string) {
  return new URLSearchParams({ endDate, startDate }).toString();
}

export function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function parseDateOnly(value: string) {
  const [year = '0', month = '1', day = '1'] = value.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function alpha2ToFlag(alpha2: string) {
  return [...alpha2.toUpperCase()]
    .map((char) => String.fromCodePoint(127_397 + (char.codePointAt(0) ?? 0)))
    .join('');
}
