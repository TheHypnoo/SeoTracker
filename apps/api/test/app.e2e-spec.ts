import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuditStatus, AuditTrigger } from '@seotracker/shared-types';
import { Queue } from 'bullmq';
import { Pool } from 'pg';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/configure-api-app';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/seotracker_test';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const TEST_SECRET = 'test-secret-value-that-is-long-enough-for-e2e-suite';
const QUEUE_NAMES = [
  'seo-audits',
  'seo-exports',
  'seo-outbound-deliveries',
  'seo-email-deliveries',
];

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.JWT_ACCESS_SECRET ??= `${TEST_SECRET}-access`;
process.env.JWT_REFRESH_SECRET ??= `${TEST_SECRET}-refresh`;
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.COOKIE_DOMAIN ??= 'localhost';
process.env.COOKIE_SECURE ??= 'false';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.TRUST_PROXY ??= '1';
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_PORT ??= '1025';
process.env.SMTP_SECURE ??= 'false';

function expectCookie(response: request.Response, cookieName: string) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  expect(cookies.some((cookie) => cookie.startsWith(`${cookieName}=`))).toBe(true);
}

function expectClearedCookie(response: request.Response, cookieName: string) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  expect(
    cookies.some(
      (cookie) =>
        cookie.startsWith(`${cookieName}=;`) &&
        cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'),
    ),
  ).toBe(true);
}

async function cleanDatabase() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'",
    );
    const tables = rows.map((row) => `"public"."${row.tablename.replaceAll('"', '""')}"`);
    if (tables.length > 0) {
      await pool.query(`truncate table ${tables.join(', ')} restart identity cascade`);
    }
  } finally {
    await pool.end();
  }
}

async function cleanQueues() {
  await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const queue = new Queue(name, { connection: { url: TEST_REDIS_URL } });
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
      }
    }),
  );
}

describe('auth to audit API flow (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    await cleanQueues();
    await cleanDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApiApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await cleanQueues();
    await cleanDatabase();
  });

  it('registers, logs in, creates a site, queues an audit, lists it, and logs out', async () => {
    const agent = request.agent(app.getHttpServer());
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `e2e-${runId}@example.com`;
    const password = 'CorrectHorse42';
    const forwardedFor = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;

    const registerResponse = await agent
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', forwardedFor)
      .send({ email, name: 'E2E User', password })
      .expect(201);

    expect(registerResponse.body.accessToken).toEqual(expect.any(String));
    expect(registerResponse.body.csrfToken).toEqual(expect.any(String));
    expect(registerResponse.body.user).toMatchObject({ email, name: 'E2E User' });
    expectCookie(registerResponse, 'refresh_token');
    expectCookie(registerResponse, 'csrf_token');

    const loginResponse = await agent
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', forwardedFor)
      .send({ email, password })
      .expect(201);

    let accessToken = loginResponse.body.accessToken as string;
    let csrfToken = loginResponse.body.csrfToken as string;
    expect(accessToken).toEqual(expect.any(String));
    expect(csrfToken).toEqual(expect.any(String));
    expectCookie(loginResponse, 'refresh_token');
    expectCookie(loginResponse, 'csrf_token');

    const sessionResponse = await agent.get('/api/v1/auth/session').expect(200);
    expect(sessionResponse.body).toMatchObject({
      email,
      id: registerResponse.body.user.id,
      name: 'E2E User',
    });

    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    const refreshResponse = await agent
      .post('/api/v1/auth/refresh')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.csrfToken).toEqual(expect.any(String));
    expectCookie(refreshResponse, 'refresh_token');
    expectCookie(refreshResponse, 'csrf_token');
    accessToken = refreshResponse.body.accessToken as string;
    csrfToken = refreshResponse.body.csrfToken as string;

    const projectsResponse = await agent
      .get('/api/v1/projects')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(projectsResponse.body).toHaveLength(1);
    const projectId = projectsResponse.body[0].id as string;
    expect(projectId).toEqual(expect.any(String));

    const siteResponse = await agent
      .post('/api/v1/sites')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        domain: 'example.com',
        name: 'Example E2E',
        projectId,
        timezone: 'Europe/Madrid',
      })
      .expect(201);

    const siteId = siteResponse.body.id as string;
    expect(siteResponse.body).toMatchObject({
      active: true,
      domain: 'example.com',
      name: 'Example E2E',
      projectId,
      timezone: 'Europe/Madrid',
    });

    const auditResponse = await agent
      .post(`/api/v1/sites/${siteId}/audits/run`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(auditResponse.body).toMatchObject({
      siteId,
      status: AuditStatus.QUEUED,
      trigger: AuditTrigger.MANUAL,
    });
    const auditRunId = auditResponse.body.id as string;
    expect(auditRunId).toEqual(expect.any(String));

    const auditListResponse = await agent
      .get(`/api/v1/sites/${siteId}/audits`)
      .query({ status: AuditStatus.QUEUED })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(auditListResponse.body.total).toBe(1);
    expect(auditListResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: auditRunId,
          siteId,
          status: AuditStatus.QUEUED,
          trigger: AuditTrigger.MANUAL,
        }),
      ]),
    );

    const logoutResponse = await agent
      .post('/api/v1/auth/logout')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    expect(logoutResponse.body).toEqual({ success: true });
    expectClearedCookie(logoutResponse, 'refresh_token');
    expectClearedCookie(logoutResponse, 'csrf_token');
    await agent.get('/api/v1/auth/session').expect(401);
  });

  it('rejects unauthenticated access, invalid DTOs and cross-project reads', async () => {
    await request(app.getHttpServer()).get('/api/v1/projects').expect(401);
    await request(app.getHttpServer()).post('/api/v1/sites').send({}).expect(401);

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ownerAgent = request.agent(app.getHttpServer());
    const strangerAgent = request.agent(app.getHttpServer());

    const ownerRegister = await ownerAgent
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', '203.0.113.41')
      .send({
        email: `owner-${runId}@example.com`,
        name: 'Owner User',
        password: 'CorrectHorse42',
      })
      .expect(201);
    const ownerToken = ownerRegister.body.accessToken as string;

    await ownerAgent
      .post('/api/v1/projects')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ name: 'x', unexpected: true })
      .expect(400);

    const projectsResponse = await ownerAgent
      .get('/api/v1/projects')
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const projectId = projectsResponse.body[0].id as string;

    await ownerAgent
      .post('/api/v1/sites')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        active: 'yes',
        domain: 'example.com',
        name: 'X',
        projectId: 'not-a-uuid',
        timezone: 'Europe/Madrid',
      })
      .expect(400);

    const siteResponse = await ownerAgent
      .post('/api/v1/sites')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        domain: 'private.example.com',
        name: 'Private Site',
        projectId,
        timezone: 'Europe/Madrid',
      })
      .expect(201);
    const siteId = siteResponse.body.id as string;

    const strangerRegister = await strangerAgent
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', '203.0.113.42')
      .send({
        email: `stranger-${runId}@example.com`,
        name: 'Stranger User',
        password: 'CorrectHorse42',
      })
      .expect(201);
    const strangerToken = strangerRegister.body.accessToken as string;

    await strangerAgent
      .get(`/api/v1/projects/${projectId}`)
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(404);

    await strangerAgent
      .get(`/api/v1/sites/${siteId}`)
      .set('authorization', `Bearer ${strangerToken}`)
      .expect(403);
  });
});
