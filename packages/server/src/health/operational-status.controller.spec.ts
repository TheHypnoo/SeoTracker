import { describe, expect, it, jest } from '@jest/globals';
import { OperationalStatusController } from './operational-status.controller';

describe('operationalStatusController', () => {
  it('delegates status reads to OperationalStatusService', () => {
    const service = {
      getStatus: jest.fn().mockReturnValue({ status: 'ok' }),
    };
    const controller = new OperationalStatusController(service as never);

    expect(controller.status()).toStrictEqual({ status: 'ok' });
    expect(service.getStatus).toHaveBeenCalledTimes(1);
  });
});
