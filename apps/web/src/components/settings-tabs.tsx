import { Link } from '@tanstack/react-router';

type TabPath = '/settings/general' | '/settings/team' | '/settings/integrations';

const TABS: Array<{ to: TabPath; label: string }> = [
  { label: 'General', to: '/settings/general' },
  { label: 'Equipo', to: '/settings/team' },
  { label: 'Integraciones', to: '/settings/integrations' },
];

export function SettingsTabs() {
  return (
    <nav
      aria-label="Secciones de ajustes"
      className="mt-5 flex gap-1 border-b border-slate-200 text-sm"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeProps={{ 'data-active': 'true' }}
          className="-mb-px border-b-2 border-transparent px-3 py-2 font-medium text-slate-600 no-underline transition data-[active=true]:border-brand-500 data-[active=true]:text-slate-900 hover:text-slate-900"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
