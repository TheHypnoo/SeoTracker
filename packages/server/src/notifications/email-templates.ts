import Handlebars from 'handlebars';
import mjml2html from 'mjml';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface EmailAction {
  label: string;
  url: string;
}

interface EmailDetail {
  label: string;
  value: string;
}

interface EmailMetric {
  label: string;
  value: string;
  detail?: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface EmailCallout {
  title: string;
  body: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

export interface AuditRegressionSignal {
  title: string;
  description: string;
  detail?: string;
  tone: 'danger' | 'warning';
}

type SpotlightTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

interface SpotlightPill {
  label: string;
  count?: number;
  tone: SpotlightTone;
}

interface SpotlightBar {
  percent: number;
  tone: SpotlightTone;
}

interface Spotlight {
  eyebrow?: string;
  primary?: string;
  primarySuffix?: string;
  primarySize?: 'xl' | 'lg' | 'md';
  caption?: string;
  bar?: SpotlightBar;
  pills?: SpotlightPill[];
  tone: SpotlightTone;
}

interface LayoutInput {
  subject: string;
  preview: string;
  eyebrow: string;
  badge: string;
  title: string;
  subtitle?: string;
  intro: string;
  tone: 'security' | 'team' | 'success' | 'warning';
  body?: string[];
  action?: EmailAction;
  spotlight?: Spotlight;
  callout?: EmailCallout;
  details?: EmailDetail[];
  metrics?: EmailMetric[];
  signals?: AuditRegressionSignal[];
  footerNote?: string;
}

export interface PasswordResetEmailInput {
  userName: string;
  resetUrl: string;
  ttlMinutes: number;
}

export interface ProjectInviteEmailInput {
  inviteUrl: string;
  role: string;
}

export interface AuditCompletedEmailInput {
  siteName: string;
  domain: string;
  score: number;
  issuesCount: number;
}

export interface AuditRegressionEmailInput {
  siteName: string;
  domain: string;
  signals: AuditRegressionSignal[];
}

class EmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTemplateError';
  }
}

const handlebars = Handlebars.create();

const baseTheme = {
  bodyBg: '#f4faff',
  border: '#ddeaf2',
  brand: '#004370',
  cta: '#0f172a',
  link: '#1d4ed8',
  muted: '#64748b',
  panel: '#f8fbfe',
  shadow: 'rgba(15,23,42,0.06)',
  subtle: '#e2e8f0',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#334155',
  white: '#ffffff',
};

const layoutTones = {
  security: {
    accent: '#004370',
    badgeBg: '#eef5fb',
    badgeBorder: '#bfd7e9',
    badgeColor: '#003255',
  },
  success: {
    accent: '#047857',
    badgeBg: '#ecfdf5',
    badgeBorder: '#a7f3d0',
    badgeColor: '#047857',
  },
  team: {
    accent: '#1d4ed8',
    badgeBg: '#eff6ff',
    badgeBorder: '#bfdbfe',
    badgeColor: '#1d4ed8',
  },
  warning: {
    accent: '#be123c',
    badgeBg: '#fff1f2',
    badgeBorder: '#fecdd3',
    badgeColor: '#be123c',
  },
} as const;

const moduleTones = {
  brand: {
    bg: '#eef5fb',
    border: '#bfd7e9',
    color: '#004370',
  },
  danger: {
    bg: '#fff1f2',
    border: '#fecdd3',
    color: '#be123c',
  },
  neutral: {
    bg: '#f8fafc',
    border: '#e2e8f0',
    color: '#334155',
  },
  success: {
    bg: '#ecfdf5',
    border: '#a7f3d0',
    color: '#047857',
  },
  warning: {
    bg: '#fffbeb',
    border: '#fde68a',
    color: '#92400e',
  },
} as const;

const headerPartial = `
<mj-section padding="30px 32px 18px" background-color="{{theme.surface}}">
  <mj-column width="65%" vertical-align="middle">
    <mj-table padding="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="width:60px;vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:48px;height:48px;background:{{theme.brand}};border-radius:14px;">
            <tr>
              <td style="padding:0 9px 9px;text-align:center;vertical-align:bottom;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td style="padding:0 1.5px;vertical-align:bottom;"><div style="width:6px;height:12px;background:#7fc4e8;border-radius:2px;"></div></td>
                    <td style="padding:0 1.5px;vertical-align:bottom;"><div style="width:6px;height:20px;background:#bde2f5;border-radius:2px;"></div></td>
                    <td style="padding:0 1.5px;vertical-align:bottom;"><div style="width:6px;height:28px;background:#ffffff;border-radius:2px;"></div></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align:middle;padding-left:14px;">
          <div style="color:{{theme.text}};font-family:'Space Grotesk', Inter, Arial, sans-serif;font-size:20px;font-weight:800;line-height:22px;letter-spacing:-0.01em;">SEOTracker</div>
          <div style="color:{{theme.muted}};font-size:11px;font-weight:700;letter-spacing:0.1em;line-height:16px;text-transform:uppercase;margin-top:3px;">Search visibility platform</div>
        </td>
      </tr>
    </mj-table>
  </mj-column>
  <mj-column width="35%" vertical-align="middle">
    <mj-text padding="6px 0 0" align="right" color="{{tone.badgeColor}}" font-size="12px" line-height="18px">
      <span style="display:inline-block;border:1px solid {{tone.badgeBorder}};background:{{tone.badgeBg}};color:{{tone.badgeColor}};border-radius:999px;padding:5px 11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">{{badge}}</span>
    </mj-text>
  </mj-column>
</mj-section>`;

const footerPartial = `
<mj-section padding="22px 32px 36px" background-color="{{theme.surface}}">
  <mj-column>
    <mj-table padding="0 0 14px" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="width:40px;vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:28px;height:28px;background:{{theme.brand}};border-radius:8px;">
            <tr>
              <td style="padding:0 5px 5px;text-align:center;vertical-align:bottom;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td style="padding:0 1px;vertical-align:bottom;"><div style="width:3px;height:7px;background:#7fc4e8;border-radius:1px;"></div></td>
                    <td style="padding:0 1px;vertical-align:bottom;"><div style="width:3px;height:12px;background:#bde2f5;border-radius:1px;"></div></td>
                    <td style="padding:0 1px;vertical-align:bottom;"><div style="width:3px;height:17px;background:#ffffff;border-radius:1px;"></div></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
        <td style="vertical-align:middle;color:{{theme.muted}};font-size:12px;line-height:18px;font-weight:600;padding-left:10px;">
          <span style="color:{{theme.text}};font-family:'Space Grotesk', Inter, Arial, sans-serif;font-weight:800;letter-spacing:-0.01em;">SEOTracker</span> &middot; Search visibility platform
        </td>
      </tr>
    </mj-table>
    <mj-divider border-width="1px" border-color="{{theme.subtle}}" border-style="solid" padding="0 0 14px" />
    <mj-text padding="0 0 8px" color="{{theme.muted}}" font-size="12px" line-height="18px">
      Recibes este correo porque está vinculado a tu cuenta de SEOTracker. Es una notificación transaccional, no marketing.
    </mj-text>
    {{#if footerNote}}
      <mj-text padding="0 0 8px" color="{{theme.muted}}" font-size="12px" line-height="18px">
        {{footerNote}}
      </mj-text>
    {{/if}}
    <mj-text padding="0" color="#94a3b8" font-size="12px" line-height="18px">
      © {{currentYear}} SEOTracker
    </mj-text>
  </mj-column>
</mj-section>`;

const layoutTemplate = handlebars.compile(
  `
<mjml>
  <mj-head>
    <mj-title>{{subject}}</mj-title>
    <mj-preview>{{preview}}</mj-preview>
    <mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
    <mj-font name="Space Grotesk" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" />
    <mj-attributes>
      <mj-all font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" />
      <mj-text color="{{theme.textSecondary}}" font-size="15px" line-height="24px" />
      <mj-button background-color="{{theme.brand}}" color="#ffffff" font-size="14px" font-weight="700" border-radius="10px" inner-padding="14px 22px" font-family="Inter, Arial, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="{{theme.bodyBg}}" width="640px">
    {{> header}}

    <mj-section background-color="#eef5fb" padding="26px 32px 28px" border-top="1px solid {{theme.brand}}">
      <mj-column>
        <mj-text padding="0 0 10px" color="{{tone.accent}}" font-size="12px" font-weight="800" letter-spacing="1.6px" text-transform="uppercase">
          {{eyebrow}}
        </mj-text>
        <mj-text padding="0" color="{{theme.text}}" font-family="Space Grotesk, Inter, Arial, sans-serif" font-size="32px" font-weight="700" line-height="38px" letter-spacing="-0.01em">
          {{title}}
        </mj-text>
        {{#if subtitle}}
          <mj-text padding="10px 0 0" color="{{theme.textSecondary}}" font-size="15px" line-height="22px">
            {{subtitle}}
          </mj-text>
        {{/if}}
      </mj-column>
    </mj-section>

    {{#if hasSpotlight}}
      <mj-section background-color="{{theme.surface}}" padding="22px 32px 8px">
        <mj-column>
          <mj-table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background:#ffffff;background-image:radial-gradient(circle at 1px 1px, #e6eff7 1px, transparent 0);background-size:14px 14px;background-position:0 0;border:1px solid {{theme.border}};border-top:3px solid {{spotlight.color}};border-radius:18px;padding:26px 28px 24px;box-shadow:0 6px 18px {{theme.shadow}};">
                {{#if spotlight.eyebrow}}
                  <div style="color:{{spotlight.color}};font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;line-height:14px;">{{spotlight.eyebrow}}</div>
                {{/if}}
                {{#if spotlight.primary}}
                  <div style="margin-top:14px;color:{{theme.text}};font-family:'Space Grotesk', Inter, Arial, sans-serif;font-weight:700;letter-spacing:-0.025em;line-height:1;">
                    <span style="font-size:{{spotlight.primaryFontSize}};color:{{spotlight.color}};">{{spotlight.primary}}</span>{{#if spotlight.primarySuffix}}<span style="font-size:18px;color:#94a3b8;font-weight:600;margin-left:8px;letter-spacing:0;">{{spotlight.primarySuffix}}</span>{{/if}}
                  </div>
                {{/if}}
                {{#if spotlight.hasBar}}
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;border-collapse:separate;">
                    <tr>
                      <td style="background:#e2e8f0;border-radius:999px;line-height:0;font-size:0;height:8px;padding:0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" style="width:{{spotlight.bar.percent}}%;background:{{spotlight.bar.color}};border-radius:999px;"><tr><td style="line-height:0;font-size:0;height:8px;">&nbsp;</td></tr></table>
                      </td>
                    </tr>
                  </table>
                {{/if}}
                {{#if spotlight.hasPills}}
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:{{spotlight.pillsMargin}};">
                    <tr>
                      {{#each spotlight.pills}}
                        <td style="padding-right:10px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" style="background:{{bg}};border:1px solid {{border}};border-radius:999px;">
                            <tr>
                              <td style="padding:7px 14px 7px 12px;color:{{color}};font-size:13px;font-weight:700;line-height:16px;white-space:nowrap;font-family:Inter, Arial, sans-serif;">
                                <span style="display:inline-block;width:8px;height:8px;background:{{color}};border-radius:999px;margin-right:8px;vertical-align:1px;"></span>{{#if count}}<span style="font-family:'Space Grotesk', Inter, Arial, sans-serif;font-weight:800;margin-right:4px;">{{count}}</span>{{/if}}{{label}}
                              </td>
                            </tr>
                          </table>
                        </td>
                      {{/each}}
                    </tr>
                  </table>
                {{/if}}
                {{#if spotlight.caption}}
                  <div style="margin-top:16px;color:#64748b;font-size:13px;line-height:19px;">{{spotlight.caption}}</div>
                {{/if}}
              </td>
            </tr>
          </mj-table>
        </mj-column>
      </mj-section>
    {{/if}}

    <mj-section background-color="{{theme.surface}}" padding="22px 32px 8px">
      <mj-column>
        <mj-text padding="0 0 14px">
          {{intro}}
        </mj-text>
        {{#each body}}
          <mj-text padding="0 0 14px">
            {{this}}
          </mj-text>
        {{/each}}
      </mj-column>
    </mj-section>

    {{#if hasCallout}}
      <mj-section background-color="{{theme.surface}}" padding="0 32px 18px">
        <mj-column>
          <mj-table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="background:{{callout.bg}};border:1px solid {{callout.border}};border-left:4px solid {{callout.color}};border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px {{theme.shadow}};">
                <div style="color:{{callout.color}};font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">{{callout.title}}</div>
                <div style="margin-top:6px;color:#334155;font-size:14px;line-height:21px;">{{callout.body}}</div>
              </td>
            </tr>
          </mj-table>
        </mj-column>
      </mj-section>
    {{/if}}

    {{#if hasMetrics}}
      <mj-section background-color="{{theme.surface}}" padding="0 24px 18px">
        {{#each metrics}}
          <mj-column width="{{../metricColumnWidth}}" padding="0 8px 12px">
            <mj-table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background:#ffffff;border:1px solid {{../theme.border}};border-top:3px solid {{color}};border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px {{../theme.shadow}};">
                  <div style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">{{label}}</div>
                  <div style="margin-top:6px;color:{{color}};font-family:'Space Grotesk', Inter, Arial, sans-serif;font-size:32px;font-weight:700;line-height:36px;letter-spacing:-0.01em;">{{value}}</div>
                  {{#if detail}}
                    <div style="margin-top:4px;color:#64748b;font-size:12px;line-height:17px;">{{detail}}</div>
                  {{/if}}
                </td>
              </tr>
            </mj-table>
          </mj-column>
        {{/each}}
      </mj-section>
    {{/if}}

    {{#if hasSignals}}
      <mj-section background-color="{{theme.surface}}" padding="0 32px 20px">
        <mj-column>
          <mj-text padding="0 0 12px" color="{{theme.text}}" font-size="13px" font-weight="800" letter-spacing=".08em" text-transform="uppercase">
            Motivos de la alerta
          </mj-text>
          <mj-table cellpadding="0" cellspacing="0" width="100%">
            {{#each signals}}
              <tr>
                <td style="padding:0 0 10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="background:#ffffff;border:1px solid {{../theme.border}};border-left:4px solid {{color}};border-radius:14px;padding:16px 18px 18px;box-shadow:0 1px 2px {{../theme.shadow}};">
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td style="width:42px;vertical-align:top;padding-top:2px;">
                              <div style="width:32px;height:32px;background:{{bg}};color:{{color}};border:1px solid {{border}};border-radius:10px;text-align:center;line-height:30px;font-family:'Space Grotesk', Inter, Arial, sans-serif;font-size:13px;font-weight:800;letter-spacing:0.02em;">{{number}}</div>
                            </td>
                            <td style="vertical-align:top;padding-left:14px;">
                              <div style="color:{{color}};font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;line-height:14px;margin-bottom:4px;">{{kicker}}</div>
                              <div style="color:{{../theme.text}};font-size:15px;font-weight:800;line-height:21px;">{{title}}</div>
                              <div style="margin-top:5px;color:#334155;font-size:14px;line-height:21px;">{{description}}</div>
                              {{#if detail}}
                                <div style="margin-top:8px;color:#64748b;font-size:12px;line-height:17px;">{{detail}}</div>
                              {{/if}}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            {{/each}}
          </mj-table>
        </mj-column>
      </mj-section>
    {{/if}}

    {{#if hasDetails}}
      <mj-section background-color="{{theme.surface}}" padding="0 32px 18px">
        <mj-column>
          <mj-table cellpadding="0" cellspacing="0" width="100%">
            {{#each details}}
              <tr>
                <td style="border-top:1px solid #e2e8f0;padding:12px 0;color:#64748b;font-size:13px;line-height:18px;width:42%;">{{label}}</td>
                <td style="border-top:1px solid #e2e8f0;padding:12px 0;color:#0f172a;font-size:13px;font-weight:800;line-height:18px;text-align:right;">{{value}}</td>
              </tr>
            {{/each}}
          </mj-table>
        </mj-column>
      </mj-section>
    {{/if}}

    {{#if hasAction}}
      <mj-section background-color="{{theme.surface}}" padding="8px 32px 28px">
        <mj-column>
          <mj-button href="{{actionUrl}}" align="left" padding="0 0 14px">
            {{actionLabel}}
          </mj-button>
          <mj-text padding="0" color="{{theme.muted}}" font-size="12px" line-height="18px">
            Si el botón no funciona, copia este enlace:<br />
            <a href="{{actionUrl}}" style="color:{{theme.link}};text-decoration:none;">{{actionUrl}}</a>
          </mj-text>
        </mj-column>
      </mj-section>
    {{/if}}

    {{> footer}}
  </mj-body>
</mjml>`,
  { strict: true },
);

handlebars.registerPartial('header', headerPartial);
handlebars.registerPartial('footer', footerPartial);

async function renderLayout(input: LayoutInput): Promise<RenderedEmail> {
  const data = {
    actionLabel: input.action?.label ?? '',
    actionUrl: input.action?.url ?? '',
    badge: input.badge,
    body: input.body ?? [],
    callout: input.callout ? withModuleTone(input.callout) : null,
    currentYear: new Date().getFullYear(),
    details: input.details ?? [],
    eyebrow: input.eyebrow,
    footerNote: input.footerNote ?? '',
    hasAction: Boolean(input.action?.label && input.action.url),
    hasCallout: Boolean(input.callout),
    hasDetails: Boolean(input.details?.length),
    hasMetrics: Boolean(input.metrics?.length),
    hasSignals: Boolean(input.signals?.length),
    hasSpotlight: Boolean(input.spotlight),
    intro: input.intro,
    metricColumnWidth: `${100 / Math.max(input.metrics?.length ?? 1, 1)}%`,
    metrics: input.metrics?.map(withModuleTone) ?? [],
    preview: input.preview,
    signals:
      input.signals?.map((signal, index) => ({
        ...withModuleTone(signal),
        kicker: signal.tone === 'danger' ? 'Crítico' : 'Aviso',
        number: String(index + 1).padStart(2, '0'),
      })) ?? [],
    spotlight: input.spotlight ? buildSpotlight(input.spotlight) : null,
    subject: input.subject,
    subtitle: input.subtitle ?? '',
    theme: baseTheme,
    tone: layoutTones[input.tone],
    title: input.title,
  };
  const mjml = layoutTemplate(data);
  const rendered = await mjml2html(mjml, {
    minify: false,
    validationLevel: 'strict',
  });

  if (rendered.errors.length > 0) {
    throw new EmailTemplateError(rendered.errors.map((error) => error.formattedMessage).join('\n'));
  }

  return {
    html: rendered.html,
    subject: input.subject,
    text: renderPlainText(input),
  };
}

function withModuleTone<T extends { tone: keyof typeof moduleTones }>(item: T) {
  return {
    ...item,
    ...moduleTones[item.tone],
  };
}

const spotlightPrimarySizes = {
  lg: '44px',
  md: '26px',
  xl: '60px',
} as const;

function buildSpotlight(spotlight: Spotlight) {
  const tone = moduleTones[spotlight.tone];
  const hasPrimary = Boolean(spotlight.primary);
  const hasBar = Boolean(spotlight.bar);
  const hasPills = Boolean(spotlight.pills?.length);
  const pillsMargin = hasBar ? '20px' : hasPrimary ? '20px' : spotlight.eyebrow ? '10px' : '0';

  return {
    bar: spotlight.bar
      ? {
          color: moduleTones[spotlight.bar.tone].color,
          percent: Math.max(0, Math.min(100, spotlight.bar.percent)),
        }
      : null,
    caption: spotlight.caption ?? '',
    color: tone.color,
    eyebrow: spotlight.eyebrow ?? '',
    hasBar,
    hasPills,
    pills:
      spotlight.pills?.map((pill) => ({
        ...pill,
        ...moduleTones[pill.tone],
      })) ?? [],
    pillsMargin,
    primary: spotlight.primary ?? '',
    primaryFontSize: spotlightPrimarySizes[spotlight.primarySize ?? 'xl'],
    primarySuffix: spotlight.primarySuffix ?? '',
  };
}

function renderPlainText(input: LayoutInput) {
  const lines = [
    input.title,
    ...(input.subtitle ? [input.subtitle] : []),
    '',
    input.intro,
    ...(input.body ?? []),
    ...(input.spotlight ? ['', ...formatSpotlightPlainText(input.spotlight)] : []),
    ...(input.callout ? ['', `${input.callout.title}: ${input.callout.body}`] : []),
    ...(input.metrics?.length ? ['', ...input.metrics.map(formatMetricPlainText)] : []),
    ...(input.signals?.length
      ? ['', 'Motivos de la alerta', ...input.signals.map(formatSignalPlainText)]
      : []),
    ...(input.details?.length
      ? ['', ...input.details.map((detail) => `${detail.label}: ${detail.value}`)]
      : []),
    ...(input.action ? ['', `${input.action.label}: ${input.action.url}`] : []),
    ...(input.footerNote ? ['', input.footerNote] : []),
    '',
    'Recibes este correo porque está vinculado a tu cuenta de SEOTracker. Es una notificación transaccional, no marketing.',
    'SEOTracker',
  ];

  return lines
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function formatSpotlightPlainText(spotlight: Spotlight): string[] {
  const lines: string[] = [];
  if (spotlight.eyebrow) {
    lines.push(spotlight.eyebrow.toUpperCase());
  }
  if (spotlight.primary) {
    lines.push(
      `${spotlight.primary}${spotlight.primarySuffix ? ` ${spotlight.primarySuffix}` : ''}`,
    );
  }
  if (spotlight.bar) {
    lines.push(`Progreso: ${Math.max(0, Math.min(100, spotlight.bar.percent))}%`);
  }
  if (spotlight.pills?.length) {
    lines.push(
      spotlight.pills
        .map((pill) => `${pill.count !== undefined ? `${pill.count} ` : ''}${pill.label}`)
        .join(' · '),
    );
  }
  if (spotlight.caption) {
    lines.push(spotlight.caption);
  }
  return lines;
}

function formatMetricPlainText(metric: EmailMetric) {
  return `${metric.label}: ${metric.value}${metric.detail ? ` (${metric.detail})` : ''}`;
}

function formatSignalPlainText(signal: AuditRegressionSignal) {
  return `${signal.title}: ${signal.description}${signal.detail ? ` ${signal.detail}` : ''}`;
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput) {
  return renderLayout({
    action: {
      label: 'Restablecer contraseña',
      url: input.resetUrl,
    },
    badge: 'Seguridad',
    callout: {
      body: 'Nunca compartas este enlace. SEOTracker no te pedirá la contraseña por email.',
      title: 'Solicitud privada',
      tone: 'brand',
    },
    eyebrow: 'Seguridad',
    footerNote:
      'Si no has solicitado este cambio, puedes ignorar este correo. Tu contraseña actual seguirá siendo válida.',
    intro: `Hola ${input.userName}. Hemos recibido una solicitud para restablecer tu contraseña.`,
    preview: `Tu enlace de recuperación caduca en ${input.ttlMinutes} minutos.`,
    spotlight: {
      caption: 'Pasado este tiempo, tendrás que solicitar un enlace nuevo.',
      eyebrow: 'Tiempo de validez',
      primary: String(input.ttlMinutes),
      primarySize: 'xl',
      primarySuffix: 'minutos',
      tone: 'brand',
    },
    subject: 'SEOTracker - Recuperación de contraseña',
    subtitle: 'Hemos generado un enlace seguro de un solo uso para tu cuenta.',
    title: 'Restablece tu contraseña',
    tone: 'security',
  });
}

export function renderProjectInviteEmail(input: ProjectInviteEmailInput) {
  return renderLayout({
    action: {
      label: 'Aceptar invitación',
      url: input.inviteUrl,
    },
    badge: 'Equipo',
    body: ['Inicia sesión con este mismo correo para aceptar la invitación.'],
    eyebrow: 'Equipo',
    footerNote: 'Esta invitación caduca automáticamente si no se acepta a tiempo.',
    intro: 'Has sido invitado a colaborar en un proyecto de SEOTracker.',
    preview: 'Tienes una invitación pendiente para un proyecto de SEOTracker.',
    spotlight: {
      caption: 'Tendrás acceso al proyecto con este nivel de permisos.',
      eyebrow: 'Rol asignado',
      primary: input.role,
      primarySize: 'lg',
      tone: 'brand',
    },
    subject: 'SEOTracker - Invitación al proyecto',
    subtitle: 'Únete al espacio de trabajo y empieza a colaborar.',
    title: 'Te invitan a un proyecto',
    tone: 'team',
  });
}

export function renderAuditCompletedEmail(input: AuditCompletedEmailInput) {
  const scoreTone = scoreMetricTone(input.score);
  const issuesCaption =
    input.issuesCount === 0
      ? 'Sin problemas detectados. Todo en verde.'
      : `${input.issuesCount} ${pluralize(input.issuesCount, 'problema detectado', 'problemas detectados')}.`;

  return renderLayout({
    badge: 'Auditoría',
    body: [
      'Ya puedes revisar el histórico, comparar contra auditorías previas y priorizar acciones.',
    ],
    details: [
      { label: 'Proyecto', value: input.siteName },
      { label: 'Dominio', value: input.domain },
    ],
    eyebrow: 'Auditoría',
    intro: `La auditoría de ${input.domain} ha terminado correctamente.`,
    preview: `${input.siteName} ha terminado con score ${input.score}.`,
    spotlight: {
      bar: { percent: input.score, tone: scoreTone },
      caption: issuesCaption,
      eyebrow: 'Score final',
      primary: String(input.score),
      primarySize: 'xl',
      primarySuffix: '/ 100',
      tone: scoreTone,
    },
    subject: `SEOTracker - Auditoría completada (${input.siteName})`,
    subtitle: `Resultado del último análisis de ${input.domain}.`,
    title: 'Auditoría completada',
    tone: 'success',
  });
}

export function renderAuditRegressionEmail(input: AuditRegressionEmailInput) {
  const signalCount = input.signals.length;
  const criticalCount = input.signals.filter((signal) => signal.tone === 'danger').length;
  const warningCount = input.signals.filter((signal) => signal.tone === 'warning').length;
  const pills: SpotlightPill[] = [];
  if (criticalCount > 0) {
    pills.push({
      count: criticalCount,
      label: pluralize(criticalCount, 'Crítico', 'Críticos'),
      tone: 'danger',
    });
  }
  if (warningCount > 0) {
    pills.push({
      count: warningCount,
      label: pluralize(warningCount, 'Aviso', 'Avisos'),
      tone: 'warning',
    });
  }
  const dominantTone: SpotlightTone = criticalCount > 0 ? 'danger' : 'warning';

  return renderLayout({
    badge: 'Alerta SEO',
    callout: {
      body: 'Prioriza la revisión de los cambios recientes y valida si esta regresión puede afectar al tráfico orgánico.',
      title: 'Acción recomendada',
      tone: 'danger',
    },
    details: [
      { label: 'Proyecto', value: input.siteName },
      { label: 'Dominio', value: input.domain },
    ],
    eyebrow: 'Alerta SEO',
    intro: `SEOTracker ha detectado una regresión en ${input.domain}. Revisa los motivos a continuación y prioriza la acción que mejor proteja tu tráfico orgánico.`,
    preview: `${input.siteName} presenta ${signalCount} ${pluralize(
      signalCount,
      'señal de regresión',
      'señales de regresión',
    )}.`,
    signals: input.signals,
    spotlight: {
      caption: 'Distribución por severidad detectada en el último análisis.',
      eyebrow: 'Resumen de la alerta',
      pills,
      tone: dominantTone,
    },
    subject: `SEOTracker - Regresión detectada (${input.siteName})`,
    subtitle: `Cambios significativos detectados en ${input.domain}.`,
    title: 'Regresión detectada',
    tone: 'warning',
  });
}

function scoreMetricTone(score: number): EmailMetric['tone'] {
  if (score >= 85) {
    return 'success';
  }
  if (score >= 65) {
    return 'warning';
  }
  return 'danger';
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}
