import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryStatus } from '@seotracker/shared-types';
import type { PaginatedResponse } from '@seotracker/shared-types';
import { and, count, desc, eq, inArray, lt, or } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import type { PaginationInput } from '../common/dto/pagination.dto';
import { assertPresent } from '../common/utils/assert';
import type { Env } from '../config/env.schema';
import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import {
  emailDeliveries,
  notifications,
  projectMembers,
  userPreferences,
  users,
} from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { QueueService } from '../queue/queue.service';

export type EmailNotificationType =
  | 'AUDIT_COMPLETED'
  | 'AUDIT_REGRESSION'
  | 'CRITICAL_ISSUES'
  | 'PROJECT_INVITE';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDeliveryPayload extends EmailPayload {
  notificationType?: EmailNotificationType;
  projectId?: string;
  userId?: string;
}

export interface EmailSendResult {
  accepted: string[];
  rejected: string[];
  messageId?: string;
  response?: string;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter: Transporter;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly configService: ConfigService<Env, true>,
    private readonly queueService: QueueService,
    private readonly projectsService: ProjectsService,
  ) {
    this.transporter = nodemailer.createTransport({
      auth:
        this.configService.get('SMTP_USER', { infer: true }) &&
        this.configService.get('SMTP_PASS', { infer: true })
          ? {
              user: this.configService.get('SMTP_USER', { infer: true }),
              pass: this.configService.get('SMTP_PASS', { infer: true }),
            }
          : undefined,
      host: this.configService.get('SMTP_HOST', { infer: true }),
      port: this.configService.get('SMTP_PORT', { infer: true }),
      secure: this.configService.get('SMTP_SECURE', { infer: true }),
    });
  }

  async listForUser(
    userId: string,
    pagination: PaginationInput = { limit: 50, offset: 0 },
  ): Promise<PaginatedResponse<typeof notifications.$inferSelect>> {
    const { limit, offset } = pagination;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId));

    const items = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items,
      limit,
      offset,
      total: Number(totalRow?.total ?? 0),
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const [updated] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return { success: true };
  }

  async markManyAsRead(userId: string, notificationIds: string[]) {
    const ids = [...new Set(notificationIds)];
    if (!ids.length) {
      return { success: true, updated: 0 };
    }

    const updated = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
      .returning({ id: notifications.id });

    return { success: true, updated: updated.length };
  }

  async createInApp(userId: string, payload: { type: string; title: string; body: string }) {
    const [created] = await this.db
      .insert(notifications)
      .values({
        body: payload.body,
        title: payload.title,
        type: payload.type,
        userId,
      })
      .returning();

    return created;
  }

  async createForProjectMembers(
    projectId: string,
    payload: { type: string; title: string; body: string },
  ) {
    const members = await this.db
      .select({ email: users.email, userId: projectMembers.userId })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));

    for (const member of members) {
      await this.createInApp(member.userId, payload);
    }

    return members;
  }

  async sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.configService.get('SMTP_FROM', { infer: true }),
        html: payload.html,
        subject: payload.subject,
        text: payload.text,
        to: payload.to,
      });
      const result = {
        accepted: stringArray((info as { accepted?: unknown }).accepted),
        messageId:
          typeof (info as { messageId?: unknown }).messageId === 'string'
            ? (info as { messageId: string }).messageId
            : undefined,
        rejected: stringArray((info as { rejected?: unknown }).rejected),
        response:
          typeof (info as { response?: unknown }).response === 'string'
            ? (info as { response: string }).response
            : undefined,
      };

      if (result.rejected.length > 0) {
        throw new EmailSendError(`Email rejected for ${payload.to}`, info);
      }

      return result;
    } catch (error) {
      if (error instanceof EmailSendError) {
        throw error;
      }
      throw new EmailSendError(`Email send failed for ${payload.to}`, error);
    }
  }

  async sendBestEffortEmail(payload: EmailPayload): Promise<EmailSendResult | null> {
    try {
      return await this.sendEmail(payload);
    } catch (error) {
      this.logger.warn(
        error instanceof Error ? error.message : `Email send failed: ${String(error)}`,
      );
      return null;
    }
  }

  async enqueueEmailDelivery(payload: EmailDeliveryPayload, options: { strict?: boolean } = {}) {
    const [delivery] = await this.db
      .insert(emailDeliveries)
      .values({
        htmlBody: payload.html,
        notificationType: payload.notificationType,
        projectId: payload.projectId,
        recipientEmail: payload.to,
        status: EmailDeliveryStatus.PENDING,
        subject: payload.subject,
        textBody: payload.text,
        userId: payload.userId,
      })
      .returning();

    const saved = assertPresent(delivery, 'Email delivery creation did not return a row');

    try {
      await this.queueService.enqueueEmailDelivery({ deliveryId: saved.id });
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(emailDeliveries)
        .set({
          failedAt: new Date(),
          lastError: `Queue enqueue failed: ${message}`,
          status: EmailDeliveryStatus.FAILED,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, saved.id));

      this.logger.warn(`Email delivery ${saved.id} could not be enqueued: ${message}`);
      if (options.strict) {
        throw error;
      }
      return saved;
    }
  }

  async listEmailDeliveriesForProject(
    projectId: string,
    userId: string,
    pagination: PaginationInput = { limit: 25, offset: 0 },
    filters: { status?: EmailDeliveryStatus } = {},
  ): Promise<PaginatedResponse<typeof emailDeliveries.$inferSelect>> {
    await this.projectsService.assertOwner(projectId, userId);
    const where = filters.status
      ? and(eq(emailDeliveries.projectId, projectId), eq(emailDeliveries.status, filters.status))
      : eq(emailDeliveries.projectId, projectId);

    const [totalRow] = await this.db.select({ total: count() }).from(emailDeliveries).where(where);

    const items = await this.db
      .select()
      .from(emailDeliveries)
      .where(where)
      .orderBy(desc(emailDeliveries.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return {
      items,
      limit: pagination.limit,
      offset: pagination.offset,
      total: Number(totalRow?.total ?? 0),
    };
  }

  async retryEmailDelivery(projectId: string, deliveryId: string, userId: string) {
    await this.projectsService.assertOwner(projectId, userId);

    const [delivery] = await this.db
      .select()
      .from(emailDeliveries)
      .where(and(eq(emailDeliveries.id, deliveryId), eq(emailDeliveries.projectId, projectId)))
      .limit(1);

    if (!delivery) {
      throw new NotFoundException('Email delivery not found');
    }

    await this.db
      .update(emailDeliveries)
      .set({
        failedAt: null,
        lastError: null,
        status: EmailDeliveryStatus.PENDING,
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));

    await this.queueService.enqueueEmailDelivery({ deliveryId: delivery.id });
    return { success: true };
  }

  async reconcilePendingEmailDeliveries(options: { limit?: number; staleAfterMs?: number } = {}) {
    const staleBefore = new Date(Date.now() - (options.staleAfterMs ?? 10 * 60 * 1000));
    const limit = Math.min(options.limit ?? 100, 500);
    const candidates = await this.db
      .select({ id: emailDeliveries.id, status: emailDeliveries.status })
      .from(emailDeliveries)
      .where(
        or(
          eq(emailDeliveries.status, EmailDeliveryStatus.PENDING),
          and(
            eq(emailDeliveries.status, EmailDeliveryStatus.SENDING),
            lt(emailDeliveries.updatedAt, staleBefore),
          ),
        ),
      )
      .orderBy(emailDeliveries.createdAt)
      .limit(limit);

    for (const delivery of candidates) {
      if (delivery.status === EmailDeliveryStatus.SENDING) {
        await this.db
          .update(emailDeliveries)
          .set({
            status: EmailDeliveryStatus.PENDING,
            updatedAt: new Date(),
          })
          .where(eq(emailDeliveries.id, delivery.id));
      }
      await this.queueService
        .enqueueEmailDelivery(
          { deliveryId: delivery.id },
          { jobId: `${delivery.id}:reconcile:${Date.now()}` },
        )
        .catch((error) => {
          this.logger.warn(
            `Email delivery ${delivery.id} could not be reconciled: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return { reconciled: candidates.length };
  }

  async processEmailDelivery(deliveryId: string) {
    const [delivery] = await this.db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, deliveryId))
      .limit(1);

    if (!delivery) {
      this.logger.warn(`Email delivery ${deliveryId} not found`);
      return;
    }

    if (delivery.status === EmailDeliveryStatus.SENT) {
      return;
    }

    const attemptCount = delivery.attemptCount + 1;
    await this.db
      .update(emailDeliveries)
      .set({
        attemptCount,
        failedAt: null,
        lastError: null,
        status: EmailDeliveryStatus.SENDING,
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveries.id, delivery.id));

    try {
      const result = await this.sendEmail({
        html: delivery.htmlBody ?? undefined,
        subject: delivery.subject,
        text: delivery.textBody,
        to: delivery.recipientEmail,
      });

      await this.db
        .update(emailDeliveries)
        .set({
          lastError: null,
          providerMessageId: result.messageId,
          providerResponse: result.response,
          sentAt: new Date(),
          status: EmailDeliveryStatus.SENT,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, delivery.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(emailDeliveries)
        .set({
          failedAt: new Date(),
          lastError: message,
          status: EmailDeliveryStatus.FAILED,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, delivery.id));
      throw error;
    }
  }

  async sendEmailToProjectMembers(
    projectId: string,
    payload: { subject: string; text: string; html?: string },
    options: { bestEffort?: boolean; notificationType?: EmailNotificationType } = {},
  ) {
    const members = await this.db
      .select({
        email: users.email,
        emailOnAuditCompleted: userPreferences.emailOnAuditCompleted,
        emailOnAuditRegression: userPreferences.emailOnAuditRegression,
        emailOnCriticalIssues: userPreferences.emailOnCriticalIssues,
        userId: projectMembers.userId,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .leftJoin(userPreferences, eq(userPreferences.userId, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));

    const recipients = members.filter((member) =>
      isEmailNotificationEnabled(options.notificationType, {
        emailOnAuditCompleted: member.emailOnAuditCompleted,
        emailOnAuditRegression: member.emailOnAuditRegression,
        emailOnCriticalIssues: member.emailOnCriticalIssues,
      }),
    );

    await Promise.all(
      recipients.map((member) => {
        return this.enqueueEmailDelivery(
          {
            notificationType: options.notificationType,
            projectId,
            userId: member.userId,
            to: member.email,
            html: payload.html,
            subject: payload.subject,
            text: payload.text,
          },
          { strict: !options.bestEffort },
        );
      }),
    );
  }
}

function isEmailNotificationEnabled(
  notificationType: EmailNotificationType | undefined,
  preferences: {
    emailOnAuditCompleted: boolean | null;
    emailOnAuditRegression: boolean | null;
    emailOnCriticalIssues: boolean | null;
  },
) {
  switch (notificationType) {
    case 'AUDIT_COMPLETED': {
      return preferences.emailOnAuditCompleted ?? true;
    }
    case 'AUDIT_REGRESSION': {
      return preferences.emailOnAuditRegression ?? true;
    }
    case 'CRITICAL_ISSUES': {
      return preferences.emailOnCriticalIssues ?? true;
    }
    case 'PROJECT_INVITE':
    default: {
      return true;
    }
  }
}
