import { Link, createFileRoute } from '@tanstack/react-router';
import { redirectIfAuthed } from '../lib/redirect-if-authed-guard';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarClock,
  ChartLine,
  CheckCircle2,
  FileSearch,
  Gauge,
  History,
  Layers,
  LineChart,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Webhook,
  Workflow,
} from 'lucide-react';
import type { CSSProperties } from 'react';

const landingTitle = 'SEOTracker | Auditorías SEO continuas con alertas';
const landingDescription =
  'Auditorías SEO programadas con histórico, alertas y priorización por severidad para detectar regresiones técnicas antes de perder tráfico orgánico.';

function publicUrl(path: `/${string}`) {
  const siteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  return siteUrl ? `${siteUrl}${path}` : path;
}

export const Route = createFileRoute('/')({
  beforeLoad: redirectIfAuthed,
  head: () => ({
    links: [{ rel: 'canonical', href: publicUrl('/') }],
    meta: [
      { title: landingTitle },
      { name: 'description', content: landingDescription },
      { name: 'keywords', content: 'auditoría SEO, SEO técnico, monitorización SEO, crawler SEO' },
      { property: 'og:title', content: landingTitle },
      { property: 'og:description', content: landingDescription },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: publicUrl('/') },
      { property: 'og:image', content: publicUrl('/og-image.png') },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'SEOTracker, auditorías SEO continuas con alertas' },
      { property: 'og:locale', content: 'es_ES' },
      { property: 'og:site_name', content: 'SEOTracker' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: landingTitle },
      { name: 'twitter:description', content: landingDescription },
      { name: 'twitter:image', content: publicUrl('/og-image.png') },
      {
        'script:ld+json': {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'SEOTracker',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          inLanguage: 'es',
          url: publicUrl('/'),
          image: publicUrl('/og-image.png'),
          description: landingDescription,
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'EUR',
          },
        },
      },
      {
        'script:ld+json': {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer,
            },
          })),
        },
      },
    ],
  }),
  component: HomePage,
});

// Per-card accent colours (opengraph.to recipe — different gradient per card
// category, revealed only on hover). Stored as CSS custom properties so the
// .landing-card primitive picks them up.
type Accent = { from: string; to: string };
const accents = {
  amber: { from: '#f59e0b', to: '#fbbf24' },
  brand: { from: 'var(--color-brand-500)', to: 'var(--color-brand-300)' },
  cyan: { from: '#06b6d4', to: '#22d3ee' },
  emerald: { from: '#10b981', to: '#34d399' },
  rose: { from: '#e11d48', to: '#fb7185' },
  violet: { from: '#7c3aed', to: '#a78bfa' },
} satisfies Record<string, Accent>;

type AccentName = keyof typeof accents;

function accentVars(name: AccentName): CSSProperties {
  const accent = accents[name];
  return {
    '--card-accent-from': accent.from,
    '--card-accent-to': accent.to,
  } as CSSProperties;
}

const heroMetrics = [
  { hint: 'on-page, técnico y contenido', label: 'Checks por auditoría', value: '40+' },
  { hint: 'compara cualquier par', label: 'Histórico', value: 'Ilimitado' },
  { hint: 'cron, webhook o manual', label: 'Automatización', value: '24/7' },
] as const;

const recentAudits = [
  { delta: '+4', deltaTone: 'text-emerald-600', domain: 'tienda.com', score: 92, when: 'hace 2 min' },
  { delta: '−3', deltaTone: 'text-rose-600', domain: 'blog.ejemplo.io', score: 78, when: 'hace 14 min' },
  { delta: '+1', deltaTone: 'text-emerald-600', domain: 'app.saas.dev', score: 88, when: 'hace 38 min' },
  { delta: '+7', deltaTone: 'text-emerald-600', domain: 'docs.devshop.io', score: 95, when: 'hace 1 h' },
] as const;

const painPoints = [
  {
    accent: 'rose' as AccentName,
    body: 'Un redeploy rompe el canonical y nadie se entera hasta que cae el tráfico.',
    icon: AlertTriangle,
    title: 'Descubres regresiones tarde',
  },
  {
    accent: 'rose' as AccentName,
    body: 'PDFs de hace tres meses que no se pueden comparar con la realidad de hoy.',
    icon: FileSearch,
    title: 'Auditorías sueltas sin contexto',
  },
  {
    accent: 'rose' as AccentName,
    body: 'SEO manda correos, dev no los lee, y los tickets se quedan sin prioridad.',
    icon: Users,
    title: 'Información dispersa entre equipos',
  },
] as const;

const pillars = [
  {
    accent: 'brand' as AccentName,
    body: 'Auditorías programadas que revisan tu sitio con la frecuencia que tú elijas. Detecta cambios antes que Google.',
    icon: Radar,
    title: 'Monitor continuo',
  },
  {
    accent: 'cyan' as AccentName,
    body: 'Cada auditoría genera una puntuación desglosada por categoría y página. Tendencias claras, regresiones resaltadas.',
    icon: ChartLine,
    title: 'Score con histórico',
  },
  {
    accent: 'amber' as AccentName,
    body: 'First seen y last seen por cada incidencia. Ignora lo que no aplica, prioriza lo que importa.',
    icon: Layers,
    title: 'Issues que persisten',
  },
  {
    accent: 'violet' as AccentName,
    body: 'Proyectos, miembros y roles. Agencias y equipos internos gestionan varios dominios sin mezclar contextos.',
    icon: Workflow,
    title: 'Pensado para equipos',
  },
] as const;

const capabilities = [
  {
    accent: 'brand' as AccentName,
    category: 'Técnico',
    icon: ShieldCheck,
    items: [
      'HTTPS, HSTS y mixed content',
      'robots.txt + bloqueo a bots de IA',
      'Sitemap válido y descubrible',
      'Soft 404 y redirecciones',
    ],
  },
  {
    accent: 'cyan' as AccentName,
    category: 'On-page',
    icon: Search,
    items: [
      'Title y meta description',
      'H1 único y jerarquía de headings',
      'Canonical correcta y sin conflictos',
      'Imágenes sin alt y enlaces rotos',
    ],
  },
  {
    accent: 'emerald' as AccentName,
    category: 'Contenido',
    icon: Sparkles,
    items: [
      'Thin content y duplicados internos',
      'Schema de artículo, autor, fecha',
      'Readability y extensión mínima',
      'Páginas sin tráfico potencial',
    ],
  },
] as const;

const workflow = [
  {
    body: 'Organiza por cliente o marca. Cada dominio vive con su configuración, zona horaria y frecuencia propia.',
    icon: Target,
    step: '01',
    title: 'Añade proyectos y dominios',
  },
  {
    body: 'Crawl guiado por sitemap, sampling estratificado y profundidad 2. En minutos tienes la foto completa.',
    icon: Rocket,
    step: '02',
    title: 'Lanza la primera auditoría',
  },
  {
    body: 'Cron, webhook firmado o manual: la auditoría se repite y el histórico se acumula sin intervención.',
    icon: CalendarClock,
    step: '03',
    title: 'Programa el seguimiento',
  },
  {
    body: 'Compara auditorías, revisa regresiones, marca issues resueltos o ignorados y cierra el ciclo con el equipo.',
    icon: LineChart,
    step: '04',
    title: 'Actúa con datos',
  },
] as const;

const sectors = [
  {
    accent: 'cyan' as AccentName,
    body: 'Protege tráfico en categorías, fichas y landings estacionales. Detecta cuándo un redeploy rompe un canonical antes de perder ranking.',
    icon: BarChart3,
    tag: 'Catálogo grande',
    title: 'Ecommerce',
  },
  {
    accent: 'brand' as AccentName,
    body: 'Mantén sana la captación orgánica de páginas clave y documentación. Cada merge se puede validar con un webhook.',
    icon: Sparkles,
    tag: 'Ciclo continuo',
    title: 'SaaS y producto',
  },
  {
    accent: 'violet' as AccentName,
    body: 'Centraliza varios clientes en un único panel con histórico y alertas independientes. Reporting que se construye solo.',
    icon: Users,
    tag: 'Multi-cuenta',
    title: 'Agencias y consultoras',
  },
  {
    accent: 'amber' as AccentName,
    body: 'Controla el estado SEO de miles de artículos. Identifica contenido que envejece mal y recupera tráfico histórico.',
    icon: History,
    tag: 'Volumen alto',
    title: 'Editoriales y medios',
  },
] as const;

const differentiators = [
  {
    accent: 'brand' as AccentName,
    body: 'Screaming Frog te da una foto. SEOTracker te da la película: score histórico, deltas, regresiones y estado por incidencia.',
    icon: ShieldCheck,
    title: 'No es solo un crawler',
  },
  {
    accent: 'amber' as AccentName,
    body: 'Cuando algo cambia a peor, el panel lo destaca. No pasas semanas sin saber que el tráfico se está yendo.',
    icon: Bell,
    title: 'Te avisa, no te obliga a mirar',
  },
  {
    accent: 'cyan' as AccentName,
    body: 'Cada hallazgo lleva severidad, categoría y cómo arreglarlo. No hay listas de 300 issues sin filtrar.',
    icon: Gauge,
    title: 'Priorización por severidad',
  },
] as const;

const faqItems = [
  {
    answer:
      'Menos de cinco minutos. Creas la cuenta, añades un dominio, lanzas la primera auditoría y ya tienes un informe completo con score, incidencias y páginas analizadas.',
    question: '¿Cuánto tarda en poner en marcha un proyecto?',
  },
  {
    answer:
      'El motor revisa señales técnicas, on-page y de contenido: HTTPS, sitemap, robots, títulos, descripciones, canonicals, headings, imágenes, enlaces rotos, thin content, duplicados, schema de artículo y bloqueos a bots de IA, entre otros.',
    question: '¿Qué analiza cada auditoría exactamente?',
  },
  {
    answer:
      'Sí. Programas cron por dominio o lanzas la auditoría manualmente desde el panel, y cuando termina SEOTracker hace POST firmado a la URL que tú registres con el resultado (audit.completed, regresiones, issues críticos). Desde ahí lo conectas con Slack, GitHub Actions, tu dashboard interno o lo que necesites — sin tocar nada en el panel.',
    question: '¿Puedo integrarlo con mi CI o con releases?',
  },
  {
    answer:
      'Creas proyectos independientes con sus propios dominios, miembros y programación. Las agencias pueden separar cada cliente sin mezclar datos ni histórico.',
    question: '¿Cómo gestiono equipos y varios clientes?',
  },
  {
    answer:
      'Puedes marcarlos como ignorados. Se excluyen del score y del seguimiento, pero queda registro por si cambias de opinión. Los que reaparecen vuelven a marcarse como abiertos automáticamente.',
    question: '¿Qué pasa con los issues que no me interesan?',
  },
] as const;

function SectionEyebrow({ children }: { children: string }) {
  return <p className="landing-eyebrow">{children}</p>;
}

function HomePage() {
  return (
    <article className="space-y-24 pb-20 sm:space-y-28">
      {/* ────────────────────────────────────────────────────────────────
          HERO — center-aligned, big tinted panel behind, dot-grid texture
          ──────────────────────────────────────────────────────────────── */}
      <section className="relative pt-8 pb-12 sm:pt-12 sm:pb-16">
        {/* Tinted gradient panel sitting behind the hero content. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-2 bottom-0 -mx-4 overflow-hidden rounded-[2.5rem] border border-slate-200/60 bg-gradient-to-br from-brand-50 via-white to-amber-50/40 sm:-mx-6 lg:-mx-8"
        >
          <div className="bg-dotgrid absolute inset-0 opacity-[0.04]" />
          <div className="absolute top-0 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-brand-200/30 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-amber-200/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <SectionEyebrow>SEO en radar · 24/7</SectionEyebrow>

          <h1 className="mt-6 text-5xl leading-[1.05] font-extrabold tracking-tight text-slate-950 sm:text-6xl md:text-7xl">
            El SEO técnico de tu sitio,{' '}
            <span className="text-brand-600">
              bajo vigilancia continua
            </span>
            .
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            Lanza auditorías profundas, programa el seguimiento y detecta regresiones el mismo día
            que ocurren. Un solo panel para todos tus dominios, con histórico, alertas y
            priorización por severidad.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn-primary">
              Empezar gratis <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <a href="#producto" className="btn-secondary">
              Ver cómo funciona
            </a>
          </div>

          <p className="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />
            Sin tarjeta. Sin periodo de prueba que caduca.
          </p>
        </div>

        {/* Live console — fuses recent audits + product stats into one
            unified monitoring panel under the hero. */}
        <div className="relative mx-auto mt-16 max-w-5xl px-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 shadow-lg shadow-brand-900/5 backdrop-blur-md">
            {/* Console header */}
            <div className="flex items-center justify-between border-b border-slate-200/70 bg-slate-50/60 px-5 py-3">
              <span className="inline-flex items-center gap-2.5">
                <span className="landing-pulse" aria-hidden="true" />
                <span className="landing-mono text-[0.7rem] font-semibold tracking-[0.22em] text-slate-700 uppercase">
                  panel · en directo
                </span>
              </span>
              <span className="landing-mono hidden text-[0.65rem] tracking-[0.18em] text-slate-500 uppercase sm:inline">
                {recentAudits.length} auditorías · última hace 2 min
              </span>
            </div>

            {/* Recent audits — denser list, single column with hairlines */}
            <ul className="divide-y divide-slate-100">
              {recentAudits.map((row) => (
                <li
                  key={row.domain}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50/60"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100"
                    aria-hidden="true"
                  >
                    <Activity size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="landing-mono truncate text-sm font-semibold tracking-tight text-slate-900">
                      {row.domain}
                    </p>
                    <p className="text-xs text-slate-500">{row.when}</p>
                  </div>
                  <div className="hidden flex-1 sm:block">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-500"
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                  </div>
                  <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                    <span className="text-lg font-extrabold text-slate-900">{row.score}</span>
                    <span className={`landing-mono text-xs font-bold ${row.deltaTone}`}>
                      {row.delta}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Stats colophon */}
            <div className="grid border-t border-slate-200/70 bg-slate-50/40 sm:grid-cols-3 sm:divide-x sm:divide-slate-200/70">
              {heroMetrics.map((item) => (
                <div key={item.label} className="px-5 py-4 text-center sm:py-5">
                  <p className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                    {item.value}
                  </p>
                  <p className="landing-mono mt-1 text-[0.65rem] font-semibold tracking-[0.18em] text-slate-500 uppercase">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          PAIN POINTS — 3 col, rose-accented cards
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="text-center">
          <SectionEyebrow>el problema</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            El SEO técnico se rompe entre un deploy y el siguiente informe.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Las auditorías puntuales son una foto. Cuando llega el PDF, el problema lleva semanas en
            producción.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:gap-6">
          {painPoints.map((item) => (
            <article key={item.title} className="landing-card" style={accentVars(item.accent)}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <item.icon size={18} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          PILLARS — 4 col, rotating accents
          ──────────────────────────────────────────────────────────────── */}
      <section id="producto">
        <div className="text-center">
          <SectionEyebrow>la solución</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Un sistema que trabaja mientras tú no miras.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Crawler, histórico y priorización en una sola pieza. Dejas de reaccionar y empiezas a
            adelantarte.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {pillars.map((pillar) => (
            <article key={pillar.title} className="landing-card" style={accentVars(pillar.accent)}>
              <span
                className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 ring-1 ring-slate-200"
                style={{ color: accents[pillar.accent].from }}
              >
                <pillar.icon size={18} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-bold tracking-tight text-slate-900">
                {pillar.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          CAPABILITIES — 3 col with icons, checklist inside
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="text-center">
          <SectionEyebrow>qué revisa</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Más de 40 comprobaciones en cada auditoría.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Crawling guiado por sitemap, profundidad 2 y sampling estratificado entre homepage,
            categorías, artículos y estáticas.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:gap-6">
          {capabilities.map((group) => (
            <article key={group.category} className="landing-card" style={accentVars(group.accent)}>
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 ring-1 ring-slate-200"
                  style={{ color: accents[group.accent].from }}
                >
                  <group.icon size={18} aria-hidden="true" />
                </span>
                <h3 className="text-base font-bold tracking-tight text-slate-900">
                  {group.category}
                </h3>
              </div>
              <ul className="mt-5 space-y-2.5">
                {group.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700"
                  >
                    <CheckCircle2
                      size={14}
                      className="mt-0.5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          WORKFLOW — numbered horizontal steps
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="text-center">
          <SectionEyebrow>cómo funciona</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            De cero a seguimiento continuo en cuatro pasos.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Sin scripts, sin configuraciones interminables. La primera auditoría cuenta como
            baseline y el histórico crece solo.
          </p>
        </div>

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {workflow.map((item) => (
            <li
              key={item.step}
              className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
            >
              <span className="landing-mono absolute top-6 right-6 text-xl font-bold text-slate-200">
                {item.step}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <item.icon size={18} aria-hidden="true" />
              </span>
              <p className="mt-5 text-base font-bold tracking-tight text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          DIFFERENTIATORS — editorial pull-quote, no cards (breaks the
          card rhythm and gives the "why us" pitch real visual weight)
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="text-center">
          <SectionEyebrow>por qué seotracker</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            No es otro crawler. Es el radar que te faltaba.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            La diferencia está en lo que pasa entre auditorías: el histórico, las alertas y la forma
            de priorizar.
          </p>
        </div>

        <ol className="mx-auto mt-16 max-w-4xl divide-y divide-slate-200/80 border-y border-slate-200/80">
          {differentiators.map((item, index) => (
            <li
              key={item.title}
              className="grid items-start gap-6 py-10 sm:grid-cols-[auto_1fr] sm:gap-10 sm:py-12"
            >
              <div className="flex items-baseline gap-3 sm:flex-col sm:items-start sm:gap-2">
                <span
                  className="text-5xl font-black tracking-tight tabular-nums sm:text-7xl"
                  style={{ color: accents[item.accent].from }}
                  aria-hidden="true"
                >
                  Δ{String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-slate-200 sm:mt-2"
                  style={{
                    backgroundColor: 'rgb(248 250 252 / 1)',
                    color: accents[item.accent].from,
                  }}
                >
                  <item.icon size={16} aria-hidden="true" />
                </span>
              </div>
              <div>
                <p className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                  {item.title}
                </p>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          USE CASES — 4 cards 2x2
          ──────────────────────────────────────────────────────────────── */}
      <section id="casos">
        <div className="text-center">
          <SectionEyebrow>casos de uso</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Donde más tracción aporta.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Pensado para quienes viven del tráfico orgánico y no pueden permitirse descubrir los
            problemas por casualidad.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:gap-6">
          {sectors.map((sector) => (
            <article key={sector.title} className="landing-card" style={accentVars(sector.accent)}>
              <div className="flex items-center gap-3">
                <span
                  className="grid h-11 w-11 place-items-center rounded-lg bg-slate-50 ring-1 ring-slate-200"
                  style={{ color: accents[sector.accent].from }}
                >
                  <sector.icon size={19} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">
                    {sector.title}
                  </h3>
                  <p className="landing-mono text-[0.65rem] tracking-[0.18em] text-slate-500 uppercase">
                    {sector.tag}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">{sector.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          WEBHOOK — dark focal block, opengraph.to "API REST" analog
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-slate-100 shadow-xl shadow-slate-900/20">
          <div className="grid lg:grid-cols-[1fr_1fr]">
            <div className="p-8 sm:p-12">
              <p className="landing-mono inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
                <Webhook size={11} aria-hidden="true" /> webhooks · outbound
              </p>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Te avisa cuando algo cambia, no cuando te acuerdas de mirar.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
                Registra un endpoint en cada proyecto y SEOTracker te hará un POST cuando se
                complete una auditoría, falle, salte un issue crítico o el score sufra una
                regresión. Cada entrega va firmada con tu secret para que ningún tercero pueda
                suplantarla.
              </p>

              <ul className="mt-6 flex flex-wrap gap-2">
                {[
                  'Entrega firmada',
                  'Reintentos automáticos',
                  'Historial completo',
                  'Eventos a la carta',
                ].map((badge) => (
                  <li
                    key={badge}
                    className="landing-mono rounded-md border border-slate-700/70 bg-white/5 px-2.5 py-1 text-[0.65rem] tracking-wide text-slate-300"
                  >
                    {badge}
                  </li>
                ))}
              </ul>

              <dl className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { body: 'Cuando un crawl termina con score y deltas listos.', label: 'audit.completed' },
                  { body: 'Cuando un crawl no logra completarse.', label: 'audit.failed' },
                  { body: 'Aparece un issue de severidad crítica.', label: 'issue.critical' },
                  { body: 'El score baja respecto a la auditoría anterior.', label: 'site.regression' },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4"
                  >
                    <dt className="landing-mono text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
                      {row.label}
                    </dt>
                    <dd className="mt-1 text-sm text-slate-200">{row.body}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-6 text-xs leading-relaxed text-slate-400">
                ¿Necesitas lanzar la auditoría desde tu CI? Programa cron por dominio o lánzala
                manualmente desde el panel — al terminar, el webhook te llega igual.
              </p>
            </div>

            <div className="border-t border-slate-800 bg-slate-950/60 p-6 sm:p-8 lg:border-t-0 lg:border-l">
              <div className="flex items-center justify-between">
                <p className="landing-mono text-[0.65rem] tracking-[0.2em] text-slate-400 uppercase">
                  payload · audit.completed
                </p>
                <span className="landing-mono inline-flex items-center gap-1.5 text-[0.65rem] tracking-wide text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  POST → tu URL
                </span>
              </div>
              <pre className="landing-mono mt-4 overflow-x-auto rounded-lg border border-slate-800 bg-black/60 p-4 text-[0.78rem] leading-relaxed text-slate-200">
                {`POST https://tu-app.com/hooks/seotracker
Content-Type: application/json

{
  "event": "audit.completed",
  "siteId": "8f3a…",
  "domain": "tienda.com",
  "score": 92,
  "delta": 4,
  "newIssues": 3,
  "auditedAt": "2026-05-08T15:42:11Z"
}`}
              </pre>
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-400">
                <ArrowUpRight size={12} aria-hidden="true" />
                Conéctalo con Slack, GitHub Actions o tu propio dashboard sin tocar nada en
                SEOTracker.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          FAQ — accordion
          ──────────────────────────────────────────────────────────────── */}
      <section id="preguntas" className="mx-auto max-w-3xl">
        <div className="text-center">
          <SectionEyebrow>preguntas frecuentes</SectionEyebrow>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Lo que suele preguntarse antes de crear cuenta.
          </h2>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {faqItems.map((item, index) => (
            <details
              key={item.question}
              className={`group [&_summary::-webkit-details-marker]:hidden ${
                index === 0 ? '' : 'border-t border-slate-100'
              }`}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-base font-bold text-slate-900 transition select-none hover:bg-slate-50">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition group-open:rotate-45 group-open:border-brand-300 group-open:bg-brand-50 group-open:text-brand-600"
                >
                  <span className="text-base leading-none font-bold">+</span>
                </span>
              </summary>
              <p className="px-6 pb-6 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          CTA — final, brand-tinted panel
          ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-brand-50 via-white to-cyan-50/60 p-10 text-center sm:p-16">
        <div
          aria-hidden="true"
          className="bg-dotgrid pointer-events-none absolute inset-0 opacity-[0.04]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-2xl">
          <SectionEyebrow>empieza ya</SectionEyebrow>
          <h2 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
            Empieza a vigilar tu SEO{' '}
            <span className="text-brand-600">
              hoy
            </span>
            .
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            La primera auditoría es gratis y queda en tu histórico. Sin tarjeta, sin fricción.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary">
              Crear cuenta <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link to="/login" className="btn-secondary">
              Ya tengo cuenta
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />
              Sin tarjeta
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />
              Detecta regresiones
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" aria-hidden="true" />
              Histórico ilimitado
            </li>
          </ul>
        </div>
      </section>
    </article>
  );
}
