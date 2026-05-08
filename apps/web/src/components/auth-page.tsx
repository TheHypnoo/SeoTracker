import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface AuthPageProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthPage({ title, subtitle, children, footer }: AuthPageProps) {
  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[420px]">
        <BrandHeader />

        <div className="mt-10 rounded-3xl border border-slate-200/80 bg-white px-8 py-10 shadow-[0_12px_40px_-20px_rgb(15_23_42/0.18)] sm:px-10">
          <header className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
            <p className="text-sm leading-6 text-slate-500">{subtitle}</p>
          </header>

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-10 border-t border-slate-100 pt-6 text-center text-sm text-slate-600">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AuthFooter() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
      <span>© 2026 SEOTracker</span>
      <div className="flex items-center gap-5">
        <Link to="/legal/privacy" className="no-underline hover:text-slate-900">
          Privacidad
        </Link>
        <Link to="/legal/terms" className="no-underline hover:text-slate-900">
          Términos
        </Link>
        <Link to="/legal/security" className="no-underline hover:text-slate-900">
          Seguridad
        </Link>
      </div>
    </div>
  );
}

export function BackToLoginLink() {
  return (
    <Link
      to="/login"
      className="inline-flex items-center gap-1.5 font-semibold text-brand-600 no-underline hover:underline"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Volver a iniciar sesión
    </Link>
  );
}

function BrandHeader() {
  return (
    <div className="flex items-center justify-center">
      <Link
        to="/"
        className="inline-flex items-center gap-2 no-underline"
        aria-label="SEOTracker — inicio"
      >
        <img src="/icon.svg" alt="" aria-hidden="true" className="h-9 w-9 rounded-lg" />
        <span className="text-lg font-black tracking-tight text-slate-950">SEOTracker</span>
      </Link>
    </div>
  );
}
