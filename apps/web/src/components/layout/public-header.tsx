import { Link, useRouterState } from '@tanstack/react-router';
import { LogIn, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`rounded-md px-3 py-2 text-sm font-semibold no-underline transition ${
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </Link>
  );
}

function AnchorLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-md px-3 py-2 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-100"
    >
      {children}
    </a>
  );
}

export function PublicHeader() {
  return (
    <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 no-underline"
          aria-label="SEOTracker — inicio"
        >
          <img src="/icon.svg" alt="" aria-hidden="true" className="h-8 w-8 rounded-md" />
          SEOTracker
        </Link>

        <nav aria-label="Principal" className="flex flex-wrap items-center gap-2">
          <span className="hidden md:inline-flex">
            <AnchorLink href="/#inicio">Inicio</AnchorLink>
          </span>
          <span className="hidden md:inline-flex">
            <AnchorLink href="/#producto">Producto</AnchorLink>
          </span>
          <span className="hidden md:inline-flex">
            <AnchorLink href="/#casos">Casos</AnchorLink>
          </span>
          <NavLink to="/login">
            <span className="inline-flex items-center gap-1.5">
              <LogIn size={14} aria-hidden="true" /> Acceder
            </span>
          </NavLink>
          <Link to="/register" className="btn-primary">
            <span className="inline-flex items-center gap-1.5">
              <UserPlus size={14} aria-hidden="true" /> Crear cuenta
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
