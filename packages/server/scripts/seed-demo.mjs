#!/usr/bin/env node
/**
 * Demo seed.
 *
 * Wipes any previous "demo@seotracker.test" user and rebuilds a small but
 * representative dataset so new contributors and TFG reviewers get a
 * dashboard with content right after a fresh `pnpm db:migrate`:
 *
 *   - 1 user (demo@seotracker.test / demodemo)
 *   - 1 project ("Acme Comercio") on FREE plan
 *   - 4 sites with varied health
 *   - 6 audit runs across COMPLETED / RUNNING / FAILED
 *   - audit_pages + audit_issues + audit_comparisons + notifications +
 *     one site schedule + one outbound webhook
 *
 * Idempotent: re-running it deletes everything tied to the demo user first.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/seed-demo.mjs
 *   pnpm --filter @seotracker/server db:seed
 */

import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const DEMO_EMAIL = 'demo@seotracker.test';
const DEMO_PASSWORD = 'demodemo';
const DEMO_NAME = 'Marta García';
const MEMBER_EMAIL = 'ana@acme.com';
const MEMBER_NAME = 'Ana López';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/seotracker';

const now = new Date();
function daysAgo(days) {
  const d = new Date(now);
  d.setDate(now.getDate() - days);
  return d;
}
function hoursAgo(hours) {
  const d = new Date(now);
  d.setHours(now.getHours() - hours);
  return d;
}

const sites = [
  {
    id: randomUUID(),
    name: 'Acme Comercio',
    domain: 'acme-comercio.com',
    score: 68,
    critical: 4,
    runs: [
      { status: 'COMPLETED', score: 68, pages: 124, ageDays: 0 },
      { status: 'COMPLETED', score: 72, pages: 119, ageDays: 7 },
      { status: 'COMPLETED', score: 75, pages: 118, ageDays: 14 },
    ],
  },
  {
    id: randomUUID(),
    name: 'Shop Acme',
    domain: 'shop.acme.io',
    score: 54,
    critical: 9,
    runs: [
      { status: 'FAILED', score: null, pages: 0, ageDays: 0 },
      { status: 'COMPLETED', score: 54, pages: 89, ageDays: 3 },
    ],
  },
  {
    id: randomUUID(),
    name: 'Blog Acme',
    domain: 'blog.acme.io',
    score: 88,
    critical: 0,
    runs: [
      { status: 'RUNNING', score: null, pages: 32, ageDays: 0 },
      { status: 'COMPLETED', score: 88, pages: 156, ageDays: 5 },
    ],
  },
  {
    id: randomUUID(),
    name: 'Corp Acme',
    domain: 'corp.acme.com',
    score: 94,
    critical: 0,
    runs: [{ status: 'COMPLETED', score: 94, pages: 41, ageDays: 1 }],
  },
];

const sampleIssues = [
  {
    code: 'MISSING_TITLE',
    severity: 'CRITICAL',
    category: 'ON_PAGE',
    message: 'Falta etiqueta title',
  },
  {
    code: 'TITLE_TOO_SHORT',
    severity: 'HIGH',
    category: 'ON_PAGE',
    message: 'Título demasiado corto (< 30 caracteres)',
  },
  {
    code: 'MISSING_META_DESCRIPTION',
    severity: 'MEDIUM',
    category: 'ON_PAGE',
    message: 'Falta meta description',
  },
  {
    code: 'BROKEN_LINK',
    severity: 'HIGH',
    category: 'TECHNICAL',
    message: 'Enlace interno roto (HTTP 404)',
  },
  {
    code: 'IMAGE_WITHOUT_ALT',
    severity: 'LOW',
    category: 'MEDIA',
    message: 'Imagen sin atributo alt',
  },
];

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('[seed-demo] connected to', databaseUrl.replace(/:[^@/]+@/, ':***@'));

  try {
    await client.query('BEGIN');

    // 1. Wipe any previous demo data. Projects reference the owner via a
    // RESTRICT FK, so delete the user's projects first (that cascades to
    // sites, audits, activity_log, etc.) before removing the user itself.
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL]);
    if (existing.rowCount > 0) {
      const existingUserId = existing.rows[0].id;
      await client.query('DELETE FROM projects WHERE owner_user_id = $1', [existingUserId]);
      await client.query('DELETE FROM users WHERE email = $1', [DEMO_EMAIL]);
      console.log('[seed-demo] removed previous demo user', existingUserId);
    }
    // The demo team member is not a project owner, so the project cascade above
    // does not remove their user row — wipe it explicitly for idempotency.
    await client.query('DELETE FROM users WHERE email = $1', [MEMBER_EMAIL]);

    // 2. Create user.
    const userId = randomUUID();
    const passwordHash = await hash(DEMO_PASSWORD);
    await client.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
      [userId, DEMO_EMAIL, DEMO_NAME, passwordHash],
    );

    // 3. Create project + owner membership.
    const projectId = randomUUID();
    await client.query(
      `INSERT INTO projects (id, name, owner_user_id, plan, plan_started_at)
       VALUES ($1, $2, $3, 'FREE', NOW())`,
      [projectId, 'Acme Comercio', userId],
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, extra_permissions, revoked_permissions, created_at)
       VALUES ($1, $2, 'OWNER', '{}', '{}', NOW())`,
      [projectId, userId],
    );

    // A second member (MEMBER role) with overrides — shows the member list and
    // the permission-edit modal (Extra: activity.read, Quitada: site.delete).
    const memberUserId = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
      [memberUserId, MEMBER_EMAIL, MEMBER_NAME, await hash(DEMO_PASSWORD)],
    );
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, extra_permissions, revoked_permissions, created_at)
       VALUES ($1, $2, 'MEMBER', ARRAY['activity.read']::text[], ARRAY['site.delete']::text[], NOW())`,
      [projectId, memberUserId],
    );
    await client.query(
      `INSERT INTO user_preferences (user_id, active_project_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET active_project_id = EXCLUDED.active_project_id`,
      [userId, projectId],
    );

    // 4. Sites + their audits/pages/issues.
    for (const site of sites) {
      await client.query(
        `INSERT INTO sites (id, project_id, name, domain, normalized_domain, timezone, active, created_at)
         VALUES ($1, $2, $3, $4, $5, 'Europe/Madrid', true, NOW())`,
        [site.id, projectId, site.name, site.domain, site.domain.toLowerCase()],
      );

      for (const [index, run] of site.runs.entries()) {
        const runId = randomUUID();
        // Start ~1h before the "age" mark and finish at the age mark, so a
        // freshly-run (ageDays: 0) audit finishes at "now" — never in the
        // future, and always started < finished.
        const createdAt = hoursAgo(run.ageDays * 24 + 1);
        const startedAt = run.status === 'QUEUED' ? null : createdAt;
        const finishedAt =
          run.status === 'COMPLETED' || run.status === 'FAILED' ? hoursAgo(run.ageDays * 24) : null;
        await client.query(
          `INSERT INTO audit_runs (id, site_id, trigger, status, started_at, finished_at, http_status, response_ms, score, created_at)
           VALUES ($1, $2, 'MANUAL', $3, $4, $5, 200, 132, $6, $7)`,
          [runId, site.id, run.status, startedAt, finishedAt, run.score, createdAt],
        );

        for (let p = 0; p < run.pages; p += 1) {
          await client.query(
            `INSERT INTO audit_pages (id, audit_run_id, url, status_code, response_ms, score, created_at)
             VALUES ($1, $2, $3, 200, 110, $4, $5)`,
            [randomUUID(), runId, `https://${site.domain}/p/${p}`, run.score ?? 60, createdAt],
          );
        }

        if (run.status === 'COMPLETED' && index === 0 && site.critical > 0) {
          for (let i = 0; i < site.critical; i += 1) {
            const sample = sampleIssues[i % sampleIssues.length];
            await client.query(
              `INSERT INTO audit_issues (id, audit_run_id, issue_code, category, severity, message, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                randomUUID(),
                runId,
                sample.code,
                sample.category,
                sample.severity,
                sample.message,
                createdAt,
              ],
            );
          }
        }
      }
    }

    // 5. One site schedule (Blog Acme, daily at 09:00 Madrid).
    await client.query(
      `INSERT INTO site_schedules (id, site_id, frequency, time_of_day, timezone, enabled, created_at, updated_at)
       VALUES ($1, $2, 'DAILY', '09:00', 'Europe/Madrid', true, NOW(), NOW())`,
      [randomUUID(), sites[2].id],
    );

    // 6. One outbound webhook.
    await client.query(
      `INSERT INTO outbound_webhooks (id, project_id, name, url, secret, events, enabled, created_at, updated_at)
       VALUES ($1, $2, 'Slack #seo-alerts', 'https://hooks.slack.test/services/demo', $3, '{"audit.completed","issue.critical"}', true, NOW(), NOW())`,
      [randomUUID(), projectId, 'whsec_demo_seed_secret_value'],
    );

    // 7. Notifications inbox.
    const notifications = [
      ['AUDIT_COMPLETED', 'Auditoría completada', 'acme-comercio.com · 124 URLs', null],
      ['ISSUE_CRITICAL', 'Issue crítico detectado', 'shop.acme.io · /checkout responde 500', null],
      ['SITE_REGRESSION', 'Regresión detectada', 'acme-comercio.com · score bajó 4 puntos', null],
      ['AUDIT_COMPLETED', 'Auditoría completada', 'blog.acme.io · 156 URLs', hoursAgo(24)],
    ];
    for (const [type, title, body, readAt] of notifications) {
      await client.query(
        `INSERT INTO notifications (id, user_id, type, title, body, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [randomUUID(), userId, type, title, body, readAt],
      );
    }

    // 8. Activity log (audit trail) — drives the permission-gated Actividad timeline.
    const firstSiteId = sites[0].id;
    const activityEvents = [
      ['project.created', 'project', null, projectId, {}, daysAgo(9)],
      [
        'site.created',
        'site',
        firstSiteId,
        firstSiteId,
        { name: 'Acme Comercio', domain: 'acme-comercio.com' },
        daysAgo(8),
      ],
      ['member.invited', 'member', null, null, { email: 'ana@acme.com' }, daysAgo(6)],
      [
        'member.perms_updated',
        'member',
        null,
        null,
        {
          previousRole: 'VIEWER',
          newRole: 'MEMBER',
          extraPermissions: ['activity.read'],
          revokedPermissions: [],
        },
        daysAgo(3),
      ],
      ['audit.completed', 'audit', firstSiteId, firstSiteId, {}, hoursAgo(2)],
      ['site.deleted', 'site', null, null, { domain: 'old.acme-comercio.com' }, hoursAgo(1)],
    ];
    for (const [action, resourceType, siteId, resourceId, metadata, createdAt] of activityEvents) {
      await client.query(
        `INSERT INTO activity_log (id, project_id, site_id, user_id, role, action, resource_type, resource_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, 'OWNER', $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          projectId,
          siteId,
          userId,
          action,
          resourceType,
          resourceId,
          JSON.stringify(metadata),
          createdAt,
        ],
      );
    }

    await client.query('COMMIT');
    console.log('[seed-demo] ✅ demo data ready');
    console.log('[seed-demo] login:', DEMO_EMAIL, '/', DEMO_PASSWORD);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[seed-demo] failed, rolled back:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
