#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname as pathDirname, resolve } from 'node:path';

const { SeoEngineService } = await import('../dist/seo-engine/seo-engine.service.js');
const { TokenEncryptionService } = await import('../dist/google/token-encryption.service.js');

// Reuse the production token crypto so this script never diverges from the
// real encryption format.
const tokenEncryption = new TokenEncryptionService();

const args = parseArgs(process.argv.slice(2));
await loadEnvFiles(envFileArgs(args));

const inputPath = resolve(process.cwd(), args.input ?? 'scripts/score-calibration-domains.txt');
const outputPath = resolve(
  process.cwd(),
  args.output ?? '../../tmp/score-calibration/results.json',
);
const reportPath = resolve(process.cwd(), args.report ?? '../../tmp/score-calibration/report.md');
const concurrency = numberArg(args.concurrency, 3);
const timeoutMs = numberArg(args.timeoutMs, 5000);
const maxDepth = numberArg(args.maxDepth, 1);
const maxPages = numberArg(args.maxPages, 2);
const maxLinks = numberArg(args.maxLinks, 4);
const sitemapSampleMax = numberArg(args.sitemapSampleMax, 3);
const limit = args.limit ? numberArg(args.limit, 0) : null;
const withPageSpeed = booleanArg(
  args['with-pagespeed'] ?? args.withPagespeed ?? args.pagespeed,
  false,
);
const pageSpeedStrategy = pageSpeedStrategyArg(
  args.pagespeedStrategy ?? args['pagespeed-strategy'],
);
const pageSpeedTimeoutMs = numberArg(
  args.pagespeedTimeoutMs ?? args['pagespeed-timeout-ms'],
  45_000,
);
const pageSpeedLocale = stringArg(args.pagespeedLocale ?? args['pagespeed-locale'], 'en');
const pageSpeedAuth = await createPageSpeedAuth();

const inputText = await readFile(inputPath, 'utf-8');
const domains = unique(
  inputText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map(normalizeDomain),
).slice(0, limit ?? undefined);

if (withPageSpeed) {
  console.error(
    `[pagespeed] enabled strategy=${pageSpeedStrategy} auth=${pageSpeedAuth.mode} timeoutMs=${pageSpeedTimeoutMs}`,
  );
}

const startedAt = new Date();
const batchResults = await runPool(domains, concurrency, auditDomain);
const finishedAt = new Date();
const payload = {
  config: {
    concurrency,
    timeoutMs,
    maxDepth,
    maxPages,
    maxLinks,
    sitemapSampleMax,
    pageSpeed: withPageSpeed
      ? {
          enabled: true,
          strategy: pageSpeedStrategy,
          timeoutMs: pageSpeedTimeoutMs,
          locale: pageSpeedLocale,
          authMode: pageSpeedAuth.mode,
        }
      : { enabled: false },
  },
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  total: batchResults.length,
  results: batchResults,
};

await mkdir(pathDirname(outputPath), { recursive: true });
await mkdir(pathDirname(reportPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2));
await writeFile(reportPath, buildReport(payload));
console.log(JSON.stringify({ outputPath, reportPath, total: batchResults.length }, null, 2));

async function auditDomain(domain, index) {
  const configService = {
    get(key) {
      const values = {
        AUDIT_HTTP_TIMEOUT_MS: timeoutMs,
        AUDIT_MAX_DEPTH: maxDepth,
        AUDIT_MAX_LINKS: maxLinks,
        AUDIT_MAX_PAGES: maxPages,
        AUDIT_SITEMAP_SAMPLE_MAX: sitemapSampleMax,
        AUDIT_USER_AGENT: 'SEOTrackerBot/1.0 (+https://github.com/TheHypnoo/SeoTracker)',
      };
      return values[key];
    },
  };
  const service = new SeoEngineService(configService);
  const started = Date.now();
  try {
    const result = await service.analyzeDomain(domain, { maxDepth, maxPages });
    const metrics = Object.fromEntries(
      result.metrics.map((metric) => [metric.key, metric.valueNum ?? metric.valueText]),
    );
    const pageSpeed = withPageSpeed
      ? await analyzeWithPageSpeed(domain, {
          auth: pageSpeedAuth,
          locale: pageSpeedLocale,
          strategy: pageSpeedStrategy,
          timeoutMs: pageSpeedTimeoutMs,
        })
      : null;
    return {
      index,
      domain,
      ok: true,
      durationMs: Date.now() - started,
      score: result.seoScore,
      crawlConfidenceScore: result.crawlConfidenceScore,
      crawlConfidenceLevel: metrics.crawl_confidence_level ?? null,
      criticalRisk: result.criticalRisk,
      httpStatus: result.httpStatus ?? null,
      responseMs: result.responseMs ?? null,
      issuesCount: result.issues.length,
      pagesCount: result.pages.length,
      pageSpeed,
      pageSpeedSeoScoreMobile: pageSpeed?.mobile?.seoScore ?? null,
      pageSpeedSeoScoreDesktop: pageSpeed?.desktop?.seoScore ?? null,
      deltaVsPageSpeedMobile:
        typeof pageSpeed?.mobile?.seoScore === 'number'
          ? result.seoScore - pageSpeed.mobile.seoScore
          : null,
      deltaVsPageSpeedDesktop:
        typeof pageSpeed?.desktop?.seoScore === 'number'
          ? result.seoScore - pageSpeed.desktop.seoScore
          : null,
      topDeductions: result.scoreBreakdown.topDeductions.slice(0, 8).map((deduction) => ({
        issueCode: deduction.issueCode,
        points: deduction.cappedDeduction,
        occurrences: deduction.occurrences,
        falsePositiveRisk: deduction.falsePositiveRisk,
        impactTier: deduction.impactTier,
      })),
      issueSummary: summarizeIssues(result.issues),
      telemetrySlowest: result.engineTelemetry
        .toSorted((left, right) => right.durationMs - left.durationMs)
        .slice(0, 3)
        .map((event) => ({
          stage: event.stage,
          status: event.status,
          durationMs: event.durationMs,
        })),
    };
  } catch (error) {
    return {
      index,
      domain,
      ok: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

async function analyzeWithPageSpeed(domain, options) {
  const strategies = options.strategy === 'both' ? ['mobile', 'desktop'] : [options.strategy];
  const output = { authMode: options.auth.mode };
  for (const strategy of strategies) {
    output[strategy] = await runPageSpeed(domain, strategy, options);
  }
  return output;
}

async function runPageSpeed(domain, strategy, options) {
  const started = Date.now();
  const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  url.searchParams.set('url', `https://${domain}/`);
  url.searchParams.set('category', 'SEO');
  url.searchParams.set('strategy', strategy.toUpperCase());
  url.searchParams.set('locale', options.locale);

  const headers = {};
  try {
    if (options.auth.apiKey) {
      url.searchParams.set('key', options.auth.apiKey);
    } else {
      const accessToken = await options.auth.getAccessToken();
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const json = await safeJson(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        durationMs: Date.now() - started,
        error: pageSpeedErrorMessage(json) ?? response.statusText,
      };
    }

    const category = json?.lighthouseResult?.categories?.seo;
    const seoScore = typeof category?.score === 'number' ? Math.round(category.score * 100) : null;
    const failedAudits = failedPageSpeedSeoAudits(json).slice(0, 8);
    const runtimeError = json?.lighthouseResult?.runtimeError ?? null;
    return {
      ok: true,
      status: response.status,
      durationMs: Date.now() - started,
      seoScore,
      requestedUrl: json?.lighthouseResult?.requestedUrl ?? null,
      finalUrl: json?.lighthouseResult?.finalUrl ?? json?.id ?? null,
      lighthouseVersion: json?.lighthouseResult?.lighthouseVersion ?? null,
      fetchTime: json?.lighthouseResult?.fetchTime ?? json?.analysisUTCTimestamp ?? null,
      runWarningsCount: Array.isArray(json?.lighthouseResult?.runWarnings)
        ? json.lighthouseResult.runWarnings.length
        : 0,
      runtimeError,
      failedSeoAudits: failedAudits,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

function failedPageSpeedSeoAudits(json) {
  const auditRefs = json?.lighthouseResult?.categories?.seo?.auditRefs ?? [];
  const audits = json?.lighthouseResult?.audits ?? {};
  return auditRefs
    .map((ref) => ({ ref, audit: audits[ref.id] }))
    .filter(({ ref, audit }) => ref.weight > 0 && audit && typeof audit.score === 'number')
    .filter(({ audit }) => audit.score < 1)
    .map(({ ref, audit }) => ({
      id: ref.id,
      title: audit.title,
      score: audit.score,
      weight: ref.weight,
      displayValue: audit.displayValue ?? null,
    }))
    .toSorted((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function pageSpeedErrorMessage(json) {
  return json?.error?.message ?? json?.lighthouseResult?.runtimeError?.message ?? null;
}

async function createPageSpeedAuth() {
  const apiKey = firstEnv('PAGESPEED_API_KEY', 'GOOGLE_PAGESPEED_API_KEY', 'GOOGLE_API_KEY');
  if (apiKey) return { mode: 'api_key', apiKey, getAccessToken: async () => null };

  const accessToken = firstEnv(
    'PAGESPEED_OAUTH_ACCESS_TOKEN',
    'GOOGLE_OAUTH_ACCESS_TOKEN',
    'GOOGLE_ACCESS_TOKEN',
  );
  const refreshToken = firstEnv(
    'PAGESPEED_OAUTH_REFRESH_TOKEN',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
    'GOOGLE_REFRESH_TOKEN',
  );
  const clientId = firstEnv('PAGESPEED_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID');
  const clientSecret = firstEnv('PAGESPEED_GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');

  let cachedToken = accessToken;
  let expiresAt = accessToken ? Date.now() + 55 * 60 * 1000 : 0;

  if (refreshToken && clientId && clientSecret) {
    return {
      mode: accessToken ? 'oauth_access_refresh_token' : 'oauth_refresh_token',
      apiKey: null,
      async getAccessToken() {
        if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
        const refreshed = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
        cachedToken = refreshed.accessToken;
        expiresAt = Date.now() + Math.max(60, refreshed.expiresIn - 60) * 1000;
        return cachedToken;
      },
    };
  }

  if (accessToken)
    return { mode: 'oauth_access_token', apiKey: null, getAccessToken: async () => accessToken };

  const dbBacked = await createDbBackedGoogleOauthProvider({ clientId, clientSecret });
  if (dbBacked) return dbBacked;

  return { mode: 'none', apiKey: null, getAccessToken: async () => null };
}

async function createDbBackedGoogleOauthProvider({ clientId, clientSecret }) {
  const databaseUrl = firstEnv('PAGESPEED_GOOGLE_DATABASE_URL', 'DATABASE_URL');
  const tokenEncryptionKey = firstEnv(
    'PAGESPEED_GOOGLE_TOKEN_ENCRYPTION_KEY',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
  );
  if (!databaseUrl || !tokenEncryptionKey || !clientId || !clientSecret) return null;

  try {
    const connection = await loadGoogleOauthConnectionFromDb(databaseUrl);
    if (!connection) return null;

    let cachedToken = decryptGoogleToken(connection.access_token_encrypted, tokenEncryptionKey);
    let expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
    const encryptedRefreshToken = connection.refresh_token_encrypted;

    return {
      mode: 'oauth_db_connection',
      apiKey: null,
      async getAccessToken() {
        if (cachedToken && expiresAt && Date.now() < expiresAt - 60_000) return cachedToken;
        if (!encryptedRefreshToken) return cachedToken;
        const refreshToken = decryptGoogleToken(encryptedRefreshToken, tokenEncryptionKey);
        const refreshed = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
        cachedToken = refreshed.accessToken;
        expiresAt = Date.now() + Math.max(60, refreshed.expiresIn - 60) * 1000;
        return cachedToken;
      },
    };
  } catch (error) {
    console.error(
      `[pagespeed] could not load Google OAuth connection from DB: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

async function loadGoogleOauthConnectionFromDb(databaseUrl) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const filters = ['revoked_at IS NULL'];
    const values = [];
    const connectionId = firstEnv('PAGESPEED_GOOGLE_CONNECTION_ID');
    const projectId = firstEnv('PAGESPEED_GOOGLE_PROJECT_ID');
    if (connectionId) {
      values.push(connectionId);
      filters.push(`id = $${values.length}`);
    }
    if (projectId) {
      values.push(projectId);
      filters.push(`project_id = $${values.length}`);
    }

    const result = await client.query(
      `SELECT access_token_encrypted, refresh_token_encrypted, expires_at, scopes
       FROM google_oauth_connections
       WHERE ${filters.join(' AND ')}
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      values,
    );
    const row = result.rows[0];
    if (!row) {
      console.error('[pagespeed] no active google_oauth_connections row found');
      return null;
    }
    const scopes = Array.isArray(row.scopes) ? row.scopes : [];
    if (!scopes.includes('openid')) {
      console.error('[pagespeed] google_oauth_connections row does not include openid scope');
    }
    console.error('[pagespeed] loaded Google OAuth connection from DB');
    return row;
  } finally {
    await client.end();
  }
}

function decryptGoogleToken(encryptedPayload, rawKey) {
  return tokenEncryption.decrypt(encryptedPayload, rawKey);
}

async function refreshGoogleAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await safeJson(response);
  if (!response.ok || !json?.access_token) {
    throw new Error(
      `Google OAuth refresh failed: ${pageSpeedErrorMessage(json) ?? response.status}`,
    );
  }
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in ?? 3600) };
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

async function loadEnvFiles(paths) {
  for (const path of paths) {
    const resolved = resolve(process.cwd(), path);
    try {
      const text = await readFile(resolved, 'utf-8');
      for (const [key, value] of parseDotEnv(text)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      console.error(`[env] loaded ${resolved}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function envFileArgs(parsedArgs) {
  const explicit =
    parsedArgs['env-file'] ?? parsedArgs.envFile ?? process.env.SCORE_CALIBRATION_ENV_FILE;
  const paths = explicit
    ? String(explicit)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return unique(['.env', 'apps/api/.env', ...paths]);
}

function parseDotEnv(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [rawKey, ...rest] = line.split('=');
    const key = rawKey.trim().replace(/^export\s+/, '');
    if (!/^[A-Z0-9_]+$/i.test(key)) continue;
    let value = rest.join('=').trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}

function summarizeIssues(issues) {
  const byCode = new Map();
  for (const issue of issues) {
    const current = byCode.get(issue.issueCode) ?? {
      code: issue.issueCode,
      severity: issue.severity,
      count: 0,
    };
    current.count += 1;
    byCode.set(issue.issueCode, current);
  }
  return [...byCode.values()].toSorted(
    (left, right) => right.count - left.count || left.code.localeCompare(right.code),
  );
}

async function runPool(items, size, worker) {
  const poolResults = Array.from({ length: items.length });
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      poolResults[index] = await worker(items[index], index);
      const result = poolResults[index];
      const pageSpeedMarker = pageSpeedProgressMarker(result);
      const marker = result.ok ? `${result.score}${pageSpeedMarker}` : 'failed';
      console.error(`[${index + 1}/${items.length}] ${result.domain} ${marker}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, size) }, runWorker));
  return poolResults;
}

function pageSpeedProgressMarker(result) {
  if (!result?.ok || !result.pageSpeed) return '';
  const mobile = result.pageSpeed.mobile;
  const desktop = result.pageSpeed.desktop;
  const values = [
    mobile ? `psiM:${scoreOrError(mobile)}` : null,
    desktop ? `psiD:${scoreOrError(desktop)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return values ? ` (${values})` : '';
}

function scoreOrError(result) {
  return result.ok ? (result.seoScore ?? 'n/a') : `err:${result.status ?? 'n/a'}`;
}

function buildReport(reportPayload) {
  const ok = reportPayload.results.filter((result) => result.ok);
  const failed = reportPayload.results.filter((result) => !result.ok);
  const scores = ok.map((result) => result.score);
  const confidence = ok
    .map((result) => result.crawlConfidenceScore)
    .filter((value) => typeof value === 'number');
  const lowestScores = ok.toSorted((a, b) => a.score - b.score).slice(0, 20);
  const highestScores = ok.toSorted((a, b) => b.score - a.score).slice(0, 20);
  const lowConfidence = ok.filter((result) => (result.crawlConfidenceScore ?? 100) < 55).length;
  const blocking = ok.filter((result) => result.criticalRisk === 'BLOCKING').length;
  const issueCounts = countBy(
    ok.flatMap((result) => result.issueSummary.map((issue) => issue.code)),
  );
  const topDeductions = countBy(
    ok.flatMap((result) => result.topDeductions.map((deduction) => deduction.issueCode)),
  );
  const highFalsePositiveTopDeductions = ok.filter((result) =>
    result.topDeductions.some((deduction) => deduction.falsePositiveRisk === 'HIGH'),
  ).length;

  return [
    '# Score calibration report',
    '',
    `- Started: ${reportPayload.startedAt}`,
    `- Finished: ${reportPayload.finishedAt}`,
    `- Domains: ${reportPayload.total}`,
    `- Completed: ${ok.length}`,
    `- Failed: ${failed.length}`,
    `- Config: ${JSON.stringify(reportPayload.config)}`,
    '',
    '## Score distribution',
    '',
    `- Score avg: ${avg(scores).toFixed(1)} · p10/p50/p90: ${quantileLine(scores)}`,
    `- Crawl confidence avg: ${avg(confidence).toFixed(1)} · p10/p50/p90: ${quantileLine(confidence)}`,
    `- Low confidence (<55): ${lowConfidence}`,
    `- Blocking critical risk: ${blocking}`,
    `- Domains with high false-positive-risk top deductions: ${highFalsePositiveTopDeductions}`,
    '',
    pageSpeedReportSection(ok, reportPayload.config.pageSpeed),
    '',
    '## Lowest scores',
    '',
    scoreTable(lowestScores),
    '',
    '## Highest scores',
    '',
    scoreTable(highestScores),
    '',
    '## Most frequent detected issues',
    '',
    markdownTable(['Issue', 'Domains'], issueCounts.slice(0, 20)),
    '',
    '## Most frequent top deductions',
    '',
    markdownTable(['Issue', 'Domains'], topDeductions.slice(0, 20)),
    '',
    '## Failures',
    '',
    failed.length
      ? markdownTable(
          ['Domain', 'Duration', 'Error'],
          failed.map((result) => [result.domain, result.durationMs, result.error]),
        )
      : 'No failures.',
    '',
  ].join('\n');
}

function scoreTable(results) {
  return markdownTable(
    ['Domain', 'Score', 'Confidence', 'Critical risk', 'Top deductions'],
    results.map((result) => [
      result.domain,
      result.score,
      result.crawlConfidenceScore ?? 'n/a',
      result.criticalRisk,
      result.topDeductions
        .slice(0, 3)
        .map((deduction) => `${deduction.issueCode} (${deduction.points})`)
        .join(', '),
    ]),
  );
}

function pageSpeedReportSection(okResults, pageSpeedConfig) {
  if (!pageSpeedConfig?.enabled) return '## PageSpeed comparison\n\nNot enabled.';

  const mobile = okResults.filter((result) => result.pageSpeed?.mobile);
  const desktop = okResults.filter((result) => result.pageSpeed?.desktop);
  const mobileOk = mobile.filter((result) => result.pageSpeed.mobile.ok);
  const desktopOk = desktop.filter((result) => result.pageSpeed.desktop.ok);
  const mobileScores = mobileOk
    .map((result) => result.pageSpeed.mobile.seoScore)
    .filter((value) => typeof value === 'number');
  const desktopScores = desktopOk
    .map((result) => result.pageSpeed.desktop.seoScore)
    .filter((value) => typeof value === 'number');
  const mobileDeltas = mobileOk
    .map((result) => result.deltaVsPageSpeedMobile)
    .filter((value) => typeof value === 'number');
  const desktopDeltas = desktopOk
    .map((result) => result.deltaVsPageSpeedDesktop)
    .filter((value) => typeof value === 'number');
  const mismatches = okResults
    .flatMap((result) => [
      pageSpeedMismatchRow(result, 'mobile'),
      pageSpeedMismatchRow(result, 'desktop'),
    ])
    .filter(Boolean)
    .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 20);
  const pageSpeedFailures = okResults
    .flatMap((result) => [
      pageSpeedFailureRow(result, 'mobile'),
      pageSpeedFailureRow(result, 'desktop'),
    ])
    .filter(Boolean)
    .slice(0, 20);

  return [
    '## PageSpeed comparison',
    '',
    `- Auth mode: ${pageSpeedConfig.authMode}`,
    `- Mobile completed: ${mobileOk.length}/${mobile.length}`,
    `- Desktop completed: ${desktopOk.length}/${desktop.length}`,
    mobileScores.length
      ? `- PageSpeed SEO mobile avg: ${avg(mobileScores).toFixed(1)} · p10/p50/p90: ${quantileLine(mobileScores)}`
      : '- PageSpeed SEO mobile avg: n/a',
    desktopScores.length
      ? `- PageSpeed SEO desktop avg: ${avg(desktopScores).toFixed(1)} · p10/p50/p90: ${quantileLine(desktopScores)}`
      : '- PageSpeed SEO desktop avg: n/a',
    mobileDeltas.length
      ? `- Score - PageSpeed mobile delta avg: ${avg(mobileDeltas).toFixed(1)} · p10/p50/p90: ${quantileLine(mobileDeltas)}`
      : '- Score - PageSpeed mobile delta avg: n/a',
    desktopDeltas.length
      ? `- Score - PageSpeed desktop delta avg: ${avg(desktopDeltas).toFixed(1)} · p10/p50/p90: ${quantileLine(desktopDeltas)}`
      : '- Score - PageSpeed desktop delta avg: n/a',
    '',
    '### Largest Score vs PageSpeed mismatches',
    '',
    mismatches.length
      ? markdownTable(
          ['Domain', 'Strategy', 'Score', 'PageSpeed SEO', 'Delta', 'Confidence', 'Critical risk'],
          mismatches.map((row) => [
            row.domain,
            row.strategy,
            row.score,
            row.pageSpeedScore,
            signed(row.delta),
            row.confidence,
            row.criticalRisk,
          ]),
        )
      : 'No comparable PageSpeed scores.',
    '',
    '### PageSpeed failures',
    '',
    pageSpeedFailures.length
      ? markdownTable(
          ['Domain', 'Strategy', 'Status', 'Error'],
          pageSpeedFailures.map((row) => [row.domain, row.strategy, row.status, row.error]),
        )
      : 'No PageSpeed failures.',
  ].join('\n');
}

function pageSpeedMismatchRow(result, strategy) {
  const pageSpeed = result.pageSpeed?.[strategy];
  if (!pageSpeed?.ok || typeof pageSpeed.seoScore !== 'number') return null;
  const delta = result.score - pageSpeed.seoScore;
  return {
    domain: result.domain,
    strategy,
    score: result.score,
    pageSpeedScore: pageSpeed.seoScore,
    delta,
    confidence: result.crawlConfidenceScore ?? 'n/a',
    criticalRisk: result.criticalRisk,
  };
}

function pageSpeedFailureRow(result, strategy) {
  const pageSpeed = result.pageSpeed?.[strategy];
  if (!pageSpeed || pageSpeed.ok) return null;
  return {
    domain: result.domain,
    strategy,
    status: pageSpeed.status ?? 'n/a',
    error: pageSpeed.error ?? 'Unknown error',
  };
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].toSorted(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
  );
}

function markdownTable(headers, rows) {
  if (!rows.length) return 'No rows.';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (row) => `| ${row.map((cell) => String(cell).replaceAll('|', '\\|')).join(' | ')} |`,
    ),
  ].join('\n');
}

function quantileLine(values) {
  if (!values.length) return 'n/a';
  return `${quantile(values, 0.1).toFixed(1)} / ${quantile(values, 0.5).toFixed(1)} / ${quantile(values, 0.9).toFixed(1)}`;
}

function avg(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function quantile(values, q) {
  const sorted = [...values].toSorted((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function parseArgs(raw) {
  const parsed = {};
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item?.startsWith('--')) continue;
    const [key, inline] = item.slice(2).split('=');
    const next = raw[index + 1];
    if (inline !== undefined) {
      parsed[key] = inline;
    } else if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function numberArg(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringArg(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback;
}

function pageSpeedStrategyArg(value) {
  const strategy = stringArg(value, 'mobile');
  if (['mobile', 'desktop', 'both'].includes(strategy)) return strategy;
  throw new Error(`Invalid --pagespeed-strategy "${strategy}". Use mobile, desktop or both.`);
}

function booleanArg(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(value.toLowerCase())) return false;
  return fallback;
}

function normalizeDomain(input) {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}
