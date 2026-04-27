import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@seotracker/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { assertPresent } from '../common/utils/assert';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { sites, webhookEndpoints, webhookSecrets } from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly projectsService: ProjectsService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async listProjectEndpoints(projectId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.WEBHOOK_READ);

    const endpoints = await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.projectId, projectId))
      .orderBy(desc(webhookEndpoints.createdAt));

    const secrets = endpoints.length
      ? await this.db
          .select()
          .from(webhookSecrets)
          .where(eq(webhookSecrets.projectId, projectId))
          .orderBy(desc(webhookSecrets.rotatedAt))
      : [];

    return endpoints.map((endpoint) => {
      const activeSecret = secrets.find(
        (secret) => secret.webhookEndpointId === endpoint.id && secret.active,
      );
      return {
        ...endpoint,
        hasActiveSecret: Boolean(activeSecret),
        rotatedAt: activeSecret?.rotatedAt ?? null,
      };
    });
  }

  async createEndpoint(
    projectId: string,
    actorUserId: string,
    input: {
      name: string;
      enabled?: boolean;
    },
  ) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.WEBHOOK_WRITE);

    const secret = randomBytes(32).toString('hex');
    const endpointKey = randomBytes(12).toString('hex');
    const endpointPath = `/api/v1/webhooks/incoming/${endpointKey}`;

    const [endpoint] = await this.db
      .insert(webhookEndpoints)
      .values({
        enabled: input.enabled ?? true,
        endpointKey,
        endpointPath,
        name: input.name.trim(),
        projectId,
      })
      .returning();

    const savedEndpoint = assertPresent(endpoint, 'Webhook endpoint creation did not return a row');

    await this.db.insert(webhookSecrets).values({
      active: true,
      projectId,
      rotatedAt: new Date(),
      secretHash: secret,
      webhookEndpointId: savedEndpoint.id,
    });

    return {
      ...savedEndpoint,
      secret,
    };
  }

  async updateEndpoint(
    projectId: string,
    endpointId: string,
    actorUserId: string,
    input: {
      name?: string;
      enabled?: boolean;
    },
  ) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.WEBHOOK_WRITE);
    await this.getEndpointForProject(projectId, endpointId);

    const [updated] = await this.db
      .update(webhookEndpoints)
      .set({
        ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
        ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.projectId, projectId)))
      .returning();

    return updated;
  }

  async rotateEndpointSecret(projectId: string, endpointId: string, actorUserId: string) {
    await this.projectsService.assertPermission(projectId, actorUserId, Permission.WEBHOOK_WRITE);
    await this.getEndpointForProject(projectId, endpointId);

    const secret = randomBytes(32).toString('hex');

    await this.db
      .update(webhookSecrets)
      .set({ active: false })
      .where(
        and(
          eq(webhookSecrets.projectId, projectId),
          eq(webhookSecrets.webhookEndpointId, endpointId),
          eq(webhookSecrets.active, true),
        ),
      );

    await this.db.insert(webhookSecrets).values({
      active: true,
      projectId,
      rotatedAt: new Date(),
      secretHash: secret,
      webhookEndpointId: endpointId,
    });

    return { secret };
  }

  async verifyAndResolveProject(params: {
    endpointKey: string;
    siteId: string;
    timestampHeader: string | undefined;
    signatureHeader: string | undefined;
    payload: unknown;
  }) {
    const maxSkewSeconds = this.configService.get('WEBHOOK_MAX_SKEW_SECONDS', {
      infer: true,
    });

    if (!params.timestampHeader || !params.signatureHeader) {
      await this.systemLogsService.warn(WebhooksService.name, 'Missing webhook signature headers', {
        endpointKey: params.endpointKey,
        siteId: params.siteId,
      });
      throw new UnauthorizedException('Missing webhook signature headers');
    }

    const timestamp = Number(params.timestampHeader);
    if (!Number.isFinite(timestamp)) {
      await this.systemLogsService.warn(WebhooksService.name, 'Invalid webhook timestamp', {
        endpointKey: params.endpointKey,
        siteId: params.siteId,
      });
      throw new UnauthorizedException('Invalid webhook timestamp');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > maxSkewSeconds) {
      await this.systemLogsService.warn(
        WebhooksService.name,
        'Webhook timestamp outside allowed skew',
        {
          endpointKey: params.endpointKey,
          siteId: params.siteId,
        },
      );
      throw new UnauthorizedException('Webhook timestamp outside allowed skew');
    }

    const [endpoint] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.endpointKey, params.endpointKey),
          eq(webhookEndpoints.enabled, true),
        ),
      )
      .limit(1);

    if (!endpoint) {
      await this.systemLogsService.warn(
        WebhooksService.name,
        'Webhook endpoint not found or disabled',
        {
          endpointKey: params.endpointKey,
          siteId: params.siteId,
        },
      );
      throw new UnauthorizedException('Webhook endpoint not found');
    }

    const [secretRecord] = await this.db
      .select()
      .from(webhookSecrets)
      .where(
        and(
          eq(webhookSecrets.projectId, endpoint.projectId),
          eq(webhookSecrets.webhookEndpointId, endpoint.id),
          eq(webhookSecrets.active, true),
        ),
      )
      .orderBy(desc(webhookSecrets.rotatedAt))
      .limit(1);

    if (!secretRecord) {
      await this.systemLogsService.warn(
        WebhooksService.name,
        'No active webhook secret configured',
        {
          endpointId: endpoint.id,
          endpointKey: params.endpointKey,
        },
      );
      throw new UnauthorizedException('No webhook secret configured for endpoint');
    }

    const payloadString = JSON.stringify(params.payload);
    const expected = createHmac('sha256', secretRecord.secretHash)
      .update(`${params.timestampHeader}.${payloadString}`)
      .digest('hex');

    const left = Buffer.from(expected);
    const right = Buffer.from(params.signatureHeader);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      await this.systemLogsService.warn(WebhooksService.name, 'Invalid webhook signature', {
        endpointId: endpoint.id,
        endpointKey: params.endpointKey,
        siteId: params.siteId,
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const [site] = await this.db
      .select({
        id: sites.id,
        projectId: sites.projectId,
      })
      .from(sites)
      .where(and(eq(sites.id, params.siteId), eq(sites.projectId, endpoint.projectId)))
      .limit(1);

    if (!site) {
      throw new BadRequestException('Site not found in project');
    }

    return {
      endpoint,
      site,
    };
  }

  private async getEndpointForProject(projectId: string, endpointId: string) {
    const [endpoint] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.projectId, projectId)))
      .limit(1);

    if (!endpoint) {
      throw new BadRequestException('Webhook endpoint not found in project');
    }

    return endpoint;
  }
}
