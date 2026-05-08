import { OperationalStatusController } from './operational-status.controller';

describe('OperationalStatusController', () => {
  it('delegates status reads to OperationalStatusService', () => {
    const service = {
      getStatus: jest.fn().mockReturnValue({ status: 'ok' }),
    };
    const controller = new OperationalStatusController(service as never);

    expect(controller.status()).toEqual({ status: 'ok' });
    expect(service.getStatus).toHaveBeenCalledTimes(1);
  });
});
