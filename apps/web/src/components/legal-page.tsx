import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

interface LegalSection {
  heading: string;
  body: string;
}

export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-8 py-4">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 no-underline hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver al inicio
      </Link>

      <header className="space-y-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="text-sm text-slate-500">Última actualización: {updated}</p>
      </header>

      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">{section.heading}</h2>
            <p className="text-sm leading-7 text-slate-600">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
