import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailDeliveryStatus } from '@seotracker/shared-types';
import nodemailer from 'nodemailer';

import { DRIZZLE } from '../database/database.constants';
import { ProjectsService } from '../projects/projects.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from './notifications.service';

jest.mock<typeof import('nodemailer')>('nodemailer', () => ({
  createTransport: jest.fn() as unknown as typeof import('nodemailer').createTransport,
}));

function thenable<T>(rows: T) {
  return {
    limit: jest.fn().mockResolvedValue(rows),
    offset: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
    then: (resolve: (v: T) => unknown, reject?: (r?: unknown) => unknown): unknown =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function paginatedRows<T>(rows: T) {
  return {
    orderBy: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        offset: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

type DbMock = {
  select: jest.Mock;
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  insert: jest.Mock;
  values: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  set: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
};

function makeDb(): DbMock {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    offset: jest.fn(),
  };
}

describe('notificationsService', () => {
  let service: NotificationsService;
  let db: DbMock;
  let queue: { enqueueEmailDelivery: jest.Mock };
  let projects: { assertOwner: jest.Mock };
  let sendMail: jest.Mock;

  beforeEach(async () => {
    db = makeDb();
    queue = { enqueueEmailDelivery: jest.fn().mockResolvedValue(undefined) };
    projects = { assertOwner: jest.fn().mockResolvedValue(undefined) };
    sendMail = jest.fn().mockResolvedValue({
      accepted: ['a@b.c'],
      messageId: 'msg-1',
      rejected: [],
      response: '250 queued',
    });
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail });

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DRIZZLE, useValue: db },
        { provide: QueueService, useValue: queue },
        { provide: ProjectsService, useValue: projects },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, unknown> = {
                SMTP_FROM: 'SEOTracker <no-reply@test>',
                SMTP_HOST: 'localhost',
                SMTP_PASS: '',
                SMTP_PORT: 1025,
                SMTP_SECURE: false,
                SMTP_USER: '',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persists an email delivery and enqueues a BullMQ job', async () => {
    db.returning.mockResolvedValueOnce([{ id: 'e1', status: EmailDeliveryStatus.PENDING }]);

    const out = await service.enqueueEmailDelivery({
      notificationType: 'PROJECT_INVITE',
      projectId: 'p1',
      userId: 'u1',
      to: 'mate@x.test',
      subject: 'Invitacion',
      text: 'Acepta la invitacion',
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'PROJECT_INVITE',
        projectId: 'p1',
        userId: 'u1',
        recipientEmail: 'mate@x.test',
        status: EmailDeliveryStatus.PENDING,
        subject: 'Invitacion',
        textBody: 'Acepta la invitacion',
      }),
    );
    expect(queue.enqueueEmailDelivery).toHaveBeenCalledWith({ deliveryId: 'e1' });
    expect(out.id).toBe('e1');
  });

  it('lists user notifications with pagination metadata', async () => {
    const items = [{ id: 'n1' }, { id: 'n2' }];
    db.where
      .mockResolvedValueOnce([{ total: 2 }])
      .mockReturnValueOnce(paginatedRows(items) as never);

    await expect(service.listForUser('u1', { limit: 10, offset: 5 })).resolves.toStrictEqual({
      items,
      limit: 10,
      offset: 5,
      total: 2,
    });
  });

  it('marks one notification as read and reports not found for foreign ids', async () => {
    db.where.mockReturnValueOnce(thenable([{ id: 'n1' }])).mockReturnValueOnce(thenable([]));

    await expect(service.markAsRead('u1', 'n1')).resolves.toStrictEqual({ success: true });
    await expect(service.markAsRead('u1', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.set).toHaveBeenCalledWith({ readAt: expect.any(Date) });
  });

  it('creates in-app notifications for each project member', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        { email: 'a@example.com', userId: 'u1' },
        { email: 'b@example.com', userId: 'u2' },
      ]),
    );
    db.returning.mockResolvedValue([{ id: 'n1' }]);

    await expect(
      service.createForProjectMembers('project-1', {
        type: 'audit.completed',
        title: 'Audit finished',
        body: 'The audit is ready.',
      }),
    ).resolves.toStrictEqual([
      { email: 'a@example.com', userId: 'u1' },
      { email: 'b@example.com', userId: 'u2' },
    ]);
    expect(db.values).toHaveBeenCalledTimes(2);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'audit.completed' }),
    );
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', type: 'audit.completed' }),
    );
  });

  it('throws when the SMTP provider rejects recipients and best-effort converts failures to null', async () => {
    sendMail.mockResolvedValueOnce({
      accepted: [],
      rejected: ['mate@x.test'],
      response: '550 rejected',
    });

    await expect(
      service.sendEmail({
        to: 'mate@x.test',
        subject: 'Invitacion',
        text: 'Acepta la invitacion',
      }),
    ).rejects.toThrow('Email rejected for mate@x.test');

    sendMail.mockRejectedValueOnce(new Error('smtp unavailable'));
    await expect(
      service.sendBestEffortEmail({
        to: 'mate@x.test',
        subject: 'Invitacion',
        text: 'Acepta la invitacion',
      }),
    ).resolves.toBeNull();
  });

  it('marks the delivery as failed when it cannot be enqueued', async () => {
    db.returning.mockResolvedValueOnce([{ id: 'e1', status: EmailDeliveryStatus.PENDING }]);
    queue.enqueueEmailDelivery.mockRejectedValueOnce(new Error('redis down'));

    const out = await service.enqueueEmailDelivery({
      to: 'mate@x.test',
      subject: 'Invitacion',
      text: 'Acepta la invitacion',
    });

    expect(out.id).toBe('e1');
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        failedAt: expect.any(Date),
        lastError: 'Queue enqueue failed: redis down',
        status: EmailDeliveryStatus.FAILED,
      }),
    );
  });

  it('sends a queued email and persists provider metadata', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'e1',
          attemptCount: 0,
          htmlBody: '<p>Hola</p>',
          recipientEmail: 'mate@x.test',
          status: EmailDeliveryStatus.PENDING,
          subject: 'Invitacion',
          textBody: 'Hola',
        },
      ]),
    );

    await service.processEmailDelivery('e1');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SEOTracker <no-reply@test>',
        html: '<p>Hola</p>',
        subject: 'Invitacion',
        text: 'Hola',
        to: 'mate@x.test',
      }),
    );
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 1,
        status: EmailDeliveryStatus.SENDING,
      }),
    );
    expect(db.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lastError: null,
        providerMessageId: 'msg-1',
        providerResponse: '250 queued',
        sentAt: expect.any(Date),
        status: EmailDeliveryStatus.SENT,
      }),
    );
  });

  it('persists SMTP failures on the delivery row before rethrowing', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp unavailable'));
    db.where.mockReturnValueOnce(
      thenable([
        {
          id: 'e1',
          attemptCount: 0,
          htmlBody: null,
          recipientEmail: 'mate@x.test',
          status: EmailDeliveryStatus.PENDING,
          subject: 'Invitacion',
          textBody: 'Hola',
        },
      ]),
    );

    await expect(service.processEmailDelivery('e1')).rejects.toThrow(
      'Email send failed for mate@x.test',
    );

    expect(db.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failedAt: expect.any(Date),
        lastError: 'Email send failed for mate@x.test',
        status: EmailDeliveryStatus.FAILED,
      }),
    );
  });

  it('deduplicates notification ids when marking many notifications as read', async () => {
    db.where.mockReturnValueOnce(db as unknown as never);
    db.returning.mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }]);

    const out = await service.markManyAsRead('u1', ['n1', 'n1', 'n2']);

    expect(out).toStrictEqual({ success: true, updated: 2 });
    expect(db.set).toHaveBeenCalledWith({ readAt: expect.any(Date) });
    expect(db.returning).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it('short-circuits markManyAsRead when no ids are supplied', async () => {
    await expect(service.markManyAsRead('u1', [])).resolves.toStrictEqual({
      success: true,
      updated: 0,
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rethrows enqueue failures in strict mode after marking the delivery failed', async () => {
    const error = new Error('redis down');
    db.returning.mockResolvedValueOnce([{ id: 'e1', status: EmailDeliveryStatus.PENDING }]);
    queue.enqueueEmailDelivery.mockRejectedValueOnce(error);

    await expect(
      service.enqueueEmailDelivery(
        {
          to: 'mate@x.test',
          subject: 'Invitacion',
          text: 'Acepta la invitacion',
        },
        { strict: true },
      ),
    ).rejects.toBe(error);

    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: 'Queue enqueue failed: redis down',
        status: EmailDeliveryStatus.FAILED,
      }),
    );
  });

  it('requeues stale sending email deliveries during reconciliation', async () => {
    db.where
      .mockReturnValueOnce(
        thenable([
          { id: 'e-pending', status: EmailDeliveryStatus.PENDING },
          { id: 'e-sending', status: EmailDeliveryStatus.SENDING },
        ]),
      )
      .mockResolvedValueOnce(undefined);
    queue.enqueueEmailDelivery.mockRejectedValueOnce(new Error('redis busy'));

    const out = await service.reconcilePendingEmailDeliveries({
      limit: 2,
      staleAfterMs: 1_000,
    });

    expect(out).toStrictEqual({ reconciled: 2 });
    expect(queue.enqueueEmailDelivery).toHaveBeenCalledTimes(2);
    expect(queue.enqueueEmailDelivery).toHaveBeenCalledWith(
      { deliveryId: 'e-pending' },
      expect.objectContaining({ jobId: expect.stringContaining('e-pending:reconcile:') }),
    );
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmailDeliveryStatus.PENDING }),
    );
  });

  it('does not resend deliveries that are already sent', async () => {
    db.where.mockReturnValueOnce(
      thenable([{ id: 'e1', status: EmailDeliveryStatus.SENT, attemptCount: 1 }]),
    );

    await service.processEmailDelivery('e1');

    expect(sendMail).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('resets and requeues a failed delivery when a project owner retries it', async () => {
    db.where
      .mockReturnValueOnce(
        thenable([{ id: 'e1', projectId: 'p1', status: EmailDeliveryStatus.FAILED }]),
      )
      .mockResolvedValueOnce(undefined);

    const out = await service.retryEmailDelivery('p1', 'e1', 'owner-1');

    expect(projects.assertOwner).toHaveBeenCalledWith('p1', 'owner-1');
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        failedAt: null,
        lastError: null,
        status: EmailDeliveryStatus.PENDING,
      }),
    );
    expect(queue.enqueueEmailDelivery).toHaveBeenCalledWith({ deliveryId: 'e1' });
    expect(out).toStrictEqual({ success: true });
  });

  it('lists project email deliveries for owners and applies status filters', async () => {
    const items = [{ id: 'e1', status: EmailDeliveryStatus.FAILED }];
    db.where
      .mockResolvedValueOnce([{ total: 1 }])
      .mockReturnValueOnce(paginatedRows(items) as never);

    await expect(
      service.listEmailDeliveriesForProject(
        'project-1',
        'owner-1',
        { limit: 15, offset: 30 },
        { status: EmailDeliveryStatus.FAILED },
      ),
    ).resolves.toStrictEqual({
      items,
      limit: 15,
      offset: 30,
      total: 1,
    });
    expect(projects.assertOwner).toHaveBeenCalledWith('project-1', 'owner-1');
  });

  it('throws when retrying an email delivery outside the project scope', async () => {
    db.where.mockReturnValueOnce(thenable([]));

    await expect(service.retryEmailDelivery('project-1', 'missing', 'owner-1')).rejects.toThrow(
      'Email delivery not found',
    );
    expect(queue.enqueueEmailDelivery).not.toHaveBeenCalled();
  });

  it('logs and exits when processing a missing delivery', async () => {
    db.where.mockReturnValueOnce(thenable([]));

    await service.processEmailDelivery('missing');

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('honors project member email preferences for audit-completed notifications', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          email: 'muted@example.com',
          emailOnAuditCompleted: false,
          emailOnAuditRegression: true,
          emailOnCriticalIssues: true,
          userId: 'u-muted',
        },
        {
          email: 'active@example.com',
          emailOnAuditCompleted: null,
          emailOnAuditRegression: null,
          emailOnCriticalIssues: null,
          userId: 'u-active',
        },
      ]),
    );
    db.returning.mockResolvedValueOnce([{ id: 'e-active' }]);

    await service.sendEmailToProjectMembers(
      'project-1',
      {
        subject: 'Audit complete',
        text: 'Listo',
      },
      { notificationType: 'AUDIT_COMPLETED' },
    );

    expect(db.values).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'AUDIT_COMPLETED',
        recipientEmail: 'active@example.com',
        userId: 'u-active',
      }),
    );
  });

  it('uses critical-issue preferences and continues in best-effort mode', async () => {
    db.where.mockReturnValueOnce(
      thenable([
        {
          email: 'muted@example.com',
          emailOnAuditCompleted: true,
          emailOnAuditRegression: true,
          emailOnCriticalIssues: false,
          userId: 'u-muted',
        },
        {
          email: 'active@example.com',
          emailOnAuditCompleted: true,
          emailOnAuditRegression: true,
          emailOnCriticalIssues: true,
          userId: 'u-active',
        },
      ]),
    );
    db.returning.mockResolvedValueOnce([{ id: 'e-active' }]);
    queue.enqueueEmailDelivery.mockRejectedValueOnce(new Error('redis busy'));

    await expect(
      service.sendEmailToProjectMembers(
        'project-1',
        {
          subject: 'Critical issues',
          text: 'Review the audit.',
        },
        { bestEffort: true, notificationType: 'CRITICAL_ISSUES' },
      ),
    ).resolves.toBeUndefined();

    expect(db.values).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'CRITICAL_ISSUES',
        recipientEmail: 'active@example.com',
        userId: 'u-active',
      }),
    );
  });
});
