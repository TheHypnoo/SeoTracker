export function getTimezoneOptions() {
  type IntlWithTz = typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const withSupport = Intl as IntlWithTz;
  const zones =
    typeof withSupport.supportedValuesOf === 'function'
      ? withSupport.supportedValuesOf('timeZone')
      : ['UTC', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  return zones.map((zone) => ({ label: zone, value: zone }));
}
