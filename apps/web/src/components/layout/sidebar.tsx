import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChevronsLeft,
  ChevronsRight,
  Globe,
  LayoutDashboard,
  Sparkles,
  Users2,
  Activity,
  Webhook,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { useProject } from '../../lib/project-context';

type SidebarLinkTarget =
  | '/dashboard'
  | '/notifications'
  | '/settings/team'
  | '/settings/integrations'
  | '/settings/activity'
  | '/projects/$id/sites';

type SidebarLinkProps = {
  to: SidebarLinkTarget;
  params?: { id: string };
  label: string;
  icon: ReactNode;
  collapsed?: boolean;
};

function SidebarLink({ to, params, label, icon, collapsed }: SidebarLinkProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Treat any deeper /projects/.../sites/* path as still being on "Dominios".
  const active =
    pathname === to ||
    pathname.startsWith(`${to}/`) ||
    (to === '/projects/$id/sites' && pathname.includes('/sites'));

  return (
    <Link
      to={to}
      params={params}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline transition ${
        collapsed ? 'lg:justify-center lg:px-0 lg:py-2.5' : ''
      } ${
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span className={active ? 'text-brand-500' : 'text-slate-400'}>{icon}</span>
      <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
    </Link>
  );
}

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const project = useProject();
  const sidebarWidth = collapsed ? 'lg:w-16' : 'lg:w-60';

  return (
    <aside
      id="app-sidebar"
      aria-label="Navegación principal"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarWidth} ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div
        className={`flex items-center px-3 py-5 ${collapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-5'}`}
      >
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 no-underline"
          aria-label="SEOTracker"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white"
          >
            <Sparkles size={14} />
          </span>
          <span
            className={`text-lg font-black tracking-tight text-slate-900 ${collapsed ? 'lg:hidden' : ''}`}
          >
            SEOTracker
          </span>
        </Link>
        <button
          type="button"
          aria-label="Cerrar navegación"
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none lg:hidden"
          onClick={onCloseMobile}
        >
          <X size={18} />
        </button>
      </div>

      <nav
        aria-label="Secciones"
        className={`flex-1 overflow-y-auto pb-3 ${collapsed ? 'lg:px-2' : 'px-3'}`}
      >
        <div
          className={`pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 ${collapsed ? 'lg:hidden' : 'px-2'}`}
        >
          General
        </div>
        <div className="space-y-0.5">
          <SidebarLink
            to="/dashboard"
            label="Panel de control"
            icon={<LayoutDashboard size={16} aria-hidden="true" />}
            collapsed={collapsed}
          />
          {project.activeProjectId ? (
            <SidebarLink
              to="/projects/$id/sites"
              params={{ id: project.activeProjectId }}
              label="Dominios"
              icon={<Globe size={16} aria-hidden="true" />}
              collapsed={collapsed}
            />
          ) : null}
        </div>

        <div
          className={`pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 ${collapsed ? 'lg:hidden' : 'px-2'}`}
        >
          Proyecto
        </div>
        <div className="space-y-0.5">
          <SidebarLink
            to="/settings/team"
            label="Equipo"
            icon={<Users2 size={16} aria-hidden="true" />}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/settings/integrations"
            label="Integraciones"
            icon={<Webhook size={16} aria-hidden="true" />}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/settings/activity"
            label="Actividad"
            icon={<Activity size={16} aria-hidden="true" />}
            collapsed={collapsed}
          />
        </div>
      </nav>

      <div className="hidden border-t border-slate-200 p-2 lg:block">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed ? <span>Colapsar</span> : null}
        </button>
      </div>
    </aside>
  );
}
