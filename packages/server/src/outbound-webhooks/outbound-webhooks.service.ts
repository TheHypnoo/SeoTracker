import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OutboundDeliveryStatus, type OutboundEvent, Permission } from '@seotracker/shared-types';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { assertPresent } from '../common/utils/assert';
import { assertPublicHttpUrl } from '../common/utils/domain';
import { readBodyWithLimit, safeFetch } from '../common/utils/safe-fetch';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { outboundWebhookDeliveries, outboundWebhooks } from '../database/schema';
import { QueueService } from '../queue/queue.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { ProjectsService } from '../projects/projects.service';

export type OutboundDispatchPayload = Record<string, unknown>;

// We persist at most 2000 chars of the receiver's response, so there is no
// reason to buffer more than a small slice of it.
const MAX_WEBHOOK_RESPONSE_BYTES = 64 * 1024;

@Injectable()
export class OutboundWebhooksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly queueService: QueueService,
    private readonly projectsService: ProjectsService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async list(projectId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_READ);

    return this.db
      .select()
      .from(outboundWebhooks)
      .where(eq(outboundWebhooks.projectId, projectId))
      .orderBy(desc(outboundWebhooks.createdAt));
  }

  async create(
    projectId: string,
    actorUserId: string,
    input: {
      name: string;
      url: string;
      headerName?: string | null;
      headerValue?: string | null;
      events: OutboundEvent[];
      enabled?: boolean;
    },
  ) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);

    // Reject internal/link-local targets at write time so a webhook can never be
    // pointed at the cloud metadata endpoint or an internal service (SSRF). The
    // delivery path additionally goes through safeFetch as defense in depth.
    const url = input.url.trim();
    assertPublicHttpUrl(url, 'webhook URL');

    const secret = randomBytes(32).toString('hex');

    const [row] = await this.db
      .insert(outboundWebhooks)
      .values({
        projectId,
        name: input.name.trim(),
        url,
        headerName: input.headerName?.trim() || null,
        headerValue: input.headerValue?.trim() || null,
        secret,
        events: input.events,
        enabled: input.enabled ?? true,
      })
      .returning();

    return assertPresent(row, 'Outbound webhook creation did not return a row');
  }

  async update(
    projectId: string,
    webhookId: string,
    actorUserId: string,
    input: {
      name?: string;
      url?: string;
      headerName?: string | null;
      headerValue?: string | null;
      events?: OutboundEvent[];
      enabled?: boolean;
    },
  ) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);
    await this.getWebhookForProject(projectId, webhookId);

    let nextUrl: string | undefined;
    if (typeof input.url === 'string') {
      nextUrl = input.url.trim();
      assertPublicHttpUrl(nextUrl, 'webhook URL');
    }

    const [updated] = await this.db
      .update(outboundWebhooks)
      .set({
        ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
        ...(nextUrl !== undefined ? { url: nextUrl } : {}),
        ...(input.headerName !== undefined ? { headerName: input.headerName?.trim() || null } : {}),
        ...(input.headerValue !== undefined
          ? { headerValue: input.headerValue?.trim() || null }
          : {}),
        ...(Array.isArray(input.events) ? { events: input.events } : {}),
        ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(outboundWebhooks.id, webhookId), eq(outboundWebhooks.projectId, projectId)))
      .returning();

    return updated;
  }

  async remove(projectId: string, webhookId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);
    await this.getWebhookForProject(projectId, webhookId);

    await this.db
      .delete(outboundWebhooks)
      .where(and(eq(outboundWebhooks.id, webhookId), eq(outboundWebhooks.projectId, projectId)));

    return { ok: true };
  }

  async rotateSecret(projectId: string, webhookId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);
    await this.getWebhookForProject(projectId, webhookId);

    const secret = randomBytes(32).toString('hex');

    const [updated] = await this.db
      .update(outboundWebhooks)
      .set({ secret, updatedAt: new Date() })
      .where(and(eq(outboundWebhooks.id, webhookId), eq(outboundWebhooks.projectId, projectId)))
      .returning();

    return updated;
  }

  async revealSecret(projectId: string, webhookId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);
    const webhook = await this.getWebhookForProject(projectId, webhookId);
    return { secret: webhook.secret };
  }

  async listDeliveries(
    projectId: string,
    webhookId: string,
    actorUserId: string,
    options?: { limit?: number | undefined },
  ) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_READ);
    await this.getWebhookForProject(projectId, webhookId);

    const limit = Math.min(options?.limit ?? 25, 100);

    return this.db
      .select()
      .from(outboundWebhookDeliveries)
      .where(eq(outboundWebhookDeliveries.outboundWebhookId, webhookId))
      .orderBy(desc(outboundWebhookDeliveries.createdAt))
      .limit(limit);
  }

  async sendTestDelivery(projectId: string, webhookId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.OUTBOUND_WRITE);
    const webhook = await this.getWebhookForProject(projectId, webhookId);

    const [delivery] = await this.db
      .insert(outboundWebhookDeliveries)
      .values({
        outboundWebhookId: webhook.id,
        event: 'test.ping',
        payload: {
          test: true,
          message: 'Prueba desde SEOTracker',
          triggeredAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
        status: OutboundDeliveryStatus.PENDING,
      })
      .returning();

    const saved = assertPresent(delivery, 'Test delivery creation did not return a row');
    await this.queueService.enqueueOutboundDelivery({ deliveryId: saved.id });
    return saved;
  }

  async dispatch(params: {
    projectId: string;
    event: OutboundEvent;
    payload: OutboundDispatchPayload;
  }) {
    const subscribers = await this.db
      .select()
      .from(outboundWebhooks)
      .where(
        and(
          eq(outboundWebhooks.projectId, params.projectId),
          eq(outboundWebhooks.enabled, true),
          sql`${params.event} = ANY(${outboundWebhooks.events})`,
        ),
      );

    if (subscribers.length === 0) {
      return { dispatched: 0 };
    }

    const deliveries = await this.db
      .insert(outboundWebhookDeliveries)
      .values(
        subscribers.map((hook) => ({
          outboundWebhookId: hook.id,
          event: params.event,
          payload: params.payload as unknown as Record<string, unknown>,
          status: OutboundDeliveryStatus.PENDING,
        })),
      )
      .returning();

    await Promise.all(
      deliveries.map((delivery) =>
        this.queueService.enqueueOutboundDelivery({ deliveryId: delivery.id }),
      ),
    );

    return { dispatched: deliveries.length };
  }

  async processDelivery(deliveryId: string) {
    const [delivery] = await this.db
      .select()
      .from(outboundWebhookDeliveries)
      .where(eq(outboundWebhookDeliveries.id, deliveryId))
      .limit(1);

    if (!delivery) {
      await this.systemLogsService.warn(
        OutboundWebhooksService.name,
        'Outbound delivery not found',
        { deliveryId },
      );
      return;
    }

    if (delivery.status === OutboundDeliveryStatus.SUCCESS) {
      return;
    }

    const [webhook] = await this.db
      .select()
      .from(outboundWebhooks)
      .where(eq(outboundWebhooks.id, delivery.outboundWebhookId))
      .limit(1);

    if (!webhook || !webhook.enabled) {
      await this.db
        .update(outboundWebhookDeliveries)
        .set({
          status: OutboundDeliveryStatus.FAILED,
          errorMessage: webhook ? 'Webhook disabled' : 'Webhook not found',
          attemptCount: (delivery.attemptCount ?? 0) + 1,
        })
        .where(eq(outboundWebhookDeliveries.id, delivery.id));
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({
      event: delivery.event,
      deliveryId: delivery.id,
      createdAt: delivery.createdAt,
      payload: delivery.payload,
    });
    const signature = createHmac('sha256', webhook.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'seotracker-webhook/1.0',
      'x-seotracker-event': delivery.event,
      'x-seotracker-timestamp': timestamp,
      'x-seotracker-signature': signature,
      'x-seotracker-delivery-id': delivery.id,
    };

    if (webhook.headerName && webhook.headerValue) {
      headers[webhook.headerName] = webhook.headerValue;
    }

    const attemptCount = (delivery.attemptCount ?? 0) + 1;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      // safeFetch validates the destination (and every redirect hop) against the
      // SSRF blocklist and pins the connection to the validated public IP, so a
      // stored webhook URL can never be used to reach internal services.
      const response = await safeFetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Only the first 2000 chars are persisted, so cap the read well below
      // that. A hostile receiver returning a huge (or gzip-bombed) body must not
      // be buffered unbounded into the worker's heap. Oversize/read errors fall
      // back to an empty body — delivery success is decided by response.ok.
      const text = await readBodyWithLimit(response, MAX_WEBHOOK_RESPONSE_BYTES).catch(() => '');
      const truncated = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;

      if (!response.ok) {
        await this.db
          .update(outboundWebhookDeliveries)
          .set({
            status: OutboundDeliveryStatus.FAILED,
            attemptCount,
            statusCode: response.status,
            responseBody: truncated,
            errorMessage: `HTTP ${response.status}`,
          })
          .where(eq(outboundWebhookDeliveries.id, delivery.id));
        throw new Error(`Outbound webhook ${webhook.id} returned ${response.status}`);
      }

      await this.db
        .update(outboundWebhookDeliveries)
        .set({
          status: OutboundDeliveryStatus.SUCCESS,
          attemptCount,
          statusCode: response.status,
          responseBody: truncated,
          errorMessage: null,
          deliveredAt: new Date(),
        })
        .where(eq(outboundWebhookDeliveries.id, delivery.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(outboundWebhookDeliveries)
        .set({
          status: OutboundDeliveryStatus.FAILED,
          attemptCount,
          errorMessage: message,
        })
        .where(eq(outboundWebhookDeliveries.id, delivery.id));
      throw error;
    }
  }

  /**
   * Helper to verify HMAC signature — used by external consumers wanting to
   * validate a delivery payload against their stored secret.
   */
  static verifySignature(params: {
    secret: string;
    timestamp: string;
    body: string;
    signature: string;
  }) {
    const expected = createHmac('sha256', params.secret)
      .update(`${params.timestamp}.${params.body}`)
      .digest('hex');
    const left = Buffer.from(expected);
    const right = Buffer.from(params.signature);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private async getWebhookForProject(projectId: string, webhookId: string) {
    const [webhook] = await this.db
      .select()
      .from(outboundWebhooks)
      .where(and(eq(outboundWebhooks.id, webhookId), eq(outboundWebhooks.projectId, projectId)))
      .limit(1);

    if (!webhook) {
      throw new NotFoundException('Outbound webhook not found in project');
    }

    return webhook;
  }

  /**
   * Reaper for outbound deliveries stuck in PENDING beyond `staleAfterMs` (default: 5 min).
   * Re-enqueues them so a worker that died mid-delivery does not silently drop the event.
   * Errors per delivery are persisted to systemLogs and do not abort the loop.
   */
  async reconcilePendingDeliveries(options: { limit?: number; staleAfterMs?: number } = {}) {
    const staleBefore = new Date(Date.now() - (options.staleAfterMs ?? 5 * 60_000));
    const candidates = await this.db
      .select({
        id: outboundWebhookDeliveries.id,
        outboundWebhookId: outboundWebhookDeliveries.outboundWebhookId,
      })
      .from(outboundWebhookDeliveries)
      .where(
        and(
          eq(outboundWebhookDeliveries.status, OutboundDeliveryStatus.PENDING),
          lt(outboundWebhookDeliveries.createdAt, staleBefore),
        ),
      )
      .limit(options.limit ?? 50);

    let requeued = 0;
    for (const delivery of candidates) {
      try {
        await this.queueService.enqueueOutboundDelivery(
          { deliveryId: delivery.id },
          { jobId: `${delivery.id}:reconcile:${Date.now()}` },
        );
        requeued += 1;
      } catch (error) {
        await this.systemLogsService.error(
          OutboundWebhooksService.name,
          'Pending outbound delivery could not be reconciled',
          error,
          {
            deliveryId: delivery.id,
            outboundWebhookId: delivery.outboundWebhookId,
          },
        );
      }
    }

    return { checked: candidates.length, requeued };
  }
}
