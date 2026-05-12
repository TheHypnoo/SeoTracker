import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';

import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

const USER = { sub: 'u-1' };

describe('ExportsController', () => {
  let controller: ExportsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue('queued'),
      listForProject: jest.fn().mockResolvedValue([]),
      listForProjectScope: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue('one'),
      resolveDownload: jest.fn(),
      retry: jest.fn().mockResolvedValue({ id: 'e1', status: 'PENDING' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ExportsController],
      providers: [{ provide: ExportsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(ExportsController);
  });

  it('create delegates to service.create', () => {
    void controller.create(USER, 's1', { kind: 'AUDIT_RESULT' } as never);
    expect(service.create).toHaveBeenCalledWith('s1', 'u-1', { kind: 'AUDIT_RESULT' });
  });

  it('list applies pagination defaults', () => {
    void controller.list(USER, 's1', {} as never);
    expect(service.listForProject).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it('list passes through explicit pagination', () => {
    void controller.list(USER, 's1', { limit: 5, offset: 10 } as never);
    expect(service.listForProject).toHaveBeenCalledWith(
      's1',
      'u-1',
      expect.objectContaining({ limit: 5, offset: 10 }),
    );
  });

  it('getById delegates', () => {
    void controller.getById(USER, 'e1');
    expect(service.getById).toHaveBeenCalledWith('e1', 'u-1');
  });

  it('listForProject delegates to cross-site project scope with pagination', () => {
    void controller.listForProject(USER, 'p1', { limit: 25, offset: 50 } as never);

    expect(service.listForProjectScope).toHaveBeenCalledWith(
      'p1',
      'u-1',
      expect.objectContaining({ limit: 25, offset: 50 }),
    );
  });

  it('retry delegates to service.retry', () => {
    void controller.retry(USER, 'e1');

    expect(service.retry).toHaveBeenCalledWith('e1', 'u-1');
  });

  it('download resolves the file, sets CSV headers and streams the content', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'seotracker-controller-export-'));
    const storagePath = path.join(dir, 'history.csv');
    let streamed = '';

    try {
      await writeFile(storagePath, 'Name\nExample\n', 'utf-8');
      service.resolveDownload.mockResolvedValueOnce({ fileName: 'history.csv', storagePath });
      const chunks: Buffer[] = [];
      const response = Object.assign(
        new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
          },
        }),
        { setHeader: jest.fn() },
      );

      await controller.download(USER, 'e1', response as never);
      streamed = Buffer.concat(chunks).toString('utf-8');

      expect(service.resolveDownload).toHaveBeenCalledWith('e1', 'u-1');
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="history.csv"',
      );
    } finally {
      await rm(dir, { force: true, recursive: true });
    }

    expect(streamed).toBe('Name\nExample\n');
  });
});
