import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EmailDeliveryStatus } from '@seotracker/shared-types';

import { NotificationsController } from './notifications.controller';

describe('notificationsController', () => {
  const notificationsService = {
    listEmailDeliveriesForProject: jest.fn(),
    listForUser: jest.fn(),
    markAsRead: jest.fn(),
    markManyAsRead: jest.fn(),
    retryEmailDelivery: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists notifications with resolved pagination defaults', () => {
    const controller = new NotificationsController(notificationsService as never);

    controller.list({ sub: 'user-1' }, {});

    expect(notificationsService.listForUser).toHaveBeenCalledWith('user-1', {
      limit: 25,
      offset: 0,
    });
  });

  it('marks one or many notifications as read for the current user', () => {
    const controller = new NotificationsController(notificationsService as never);

    controller.markManyRead({ sub: 'user-1' }, { ids: ['n1', 'n2'] });
    controller.markRead({ sub: 'user-1' }, 'n1');

    expect(notificationsService.markManyAsRead).toHaveBeenCalledWith('user-1', ['n1', 'n2']);
    expect(notificationsService.markAsRead).toHaveBeenCalledWith('user-1', 'n1');
  });

  it('lists project email deliveries with pagination and status filter', () => {
    const controller = new NotificationsController(notificationsService as never);

    controller.listEmailDeliveries({ sub: 'user-1' }, 'project-1', {
      limit: 10,
      offset: 5,
      status: EmailDeliveryStatus.FAILED,
    });

    expect(notificationsService.listEmailDeliveriesForProject).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      { limit: 10, offset: 5 },
      { status: EmailDeliveryStatus.FAILED },
    );
  });

  it('retries a project email delivery for the current user', () => {
    const controller = new NotificationsController(notificationsService as never);

    controller.retryEmailDelivery({ sub: 'user-1' }, 'project-1', 'delivery-1');

    expect(notificationsService.retryEmailDelivery).toHaveBeenCalledWith(
      'project-1',
      'delivery-1',
      'user-1',
    );
  });
});
