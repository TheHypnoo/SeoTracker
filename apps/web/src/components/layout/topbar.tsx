import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Menu, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../lib/auth-context';
import { useProject } from '../../lib/project-context';
import { SelectInput } from '../select-input';
import { UserMenu } from './user-menu';

type TopbarProps = {
  onOpenMobileNav: () => void;
  mobileNavOpen: boolean;
  onOpenPalette: () => void;
};

/** Detect macOS once for the keyboard hint. SSR-safe (defaults to "Ctrl"). */
function useShortcutHint() {
  const [hint, setHint] = useState('Ctrl K');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
      setHint('⌘ K');
    }
  }, []);
  return hint;
}

export function Topbar({ onOpenMobileNav, mobileNavOpen, onOpenPalette }: TopbarProps) {
  const auth = useAuth();
  const project = useProject();
  const navigate = useNavigate();
  const shortcutHint = useShortcutHint();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
        <button
          type="button"
          aria-label="Abrir navegación"
          aria-expanded={mobileNavOpen}
          aria-controls="app-sidebar"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none lg:hidden"
          onClick={onOpenMobileNav}
        >
          <Menu size={20} />
        </button>

        {project.projects.length > 1 ? (
          <>
            <div
              className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 md:block"
              title="Un proyecto agrupa dominios, equipo e integraciones."
            >
              Proyecto
            </div>
            <div className="min-w-0 max-w-xs flex-1 md:flex-none">
              <SelectInput
                value={project.activeProjectId ?? ''}
                onValueChange={(nextProjectId) => {
                  if (!nextProjectId) {
                    return;
                  }
                  void project.setActiveProject(nextProjectId).then(() => {
                    navigate({ to: '/dashboard' });
                  });
                }}
                options={project.projects.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                placeholder="Selecciona un proyecto"
                triggerClassName="bg-white py-2"
              />
            </div>
          </>
        ) : project.projects.length === 0 ? (
          <div className="min-w-0 max-w-xs flex-1 md:flex-none">
            <Link
              to="/projects/new"
              className="inline-flex items-center gap-2 rounded-md border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 no-underline transition hover:border-brand-500 hover:bg-white"
            >
              <Plus size={14} aria-hidden="true" />
              Crear proyecto
            </Link>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Abrir buscador rápido"
          aria-keyshortcuts="Control+K Meta+K"
          className="ml-auto hidden max-w-md flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm transition hover:border-brand-300 hover:bg-brand-50/40 md:flex"
        >
          <Search size={16} className="text-slate-400" aria-hidden="true" />
          <span className="flex-1 text-left text-slate-400">Buscar dominios o páginas…</span>
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
            {shortcutHint}
          </kbd>
        </button>

        <Link
          to="/notifications"
          aria-label="Notificaciones"
          className="rounded-full p-2 text-slate-500 no-underline transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        >
          <Bell size={18} aria-hidden="true" />
        </Link>

        <UserMenu
          name={auth.user?.name}
          email={auth.user?.email}
          onLogout={() => void auth.logout()}
        />
      </div>
    </header>
  );
}
