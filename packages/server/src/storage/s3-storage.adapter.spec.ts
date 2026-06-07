import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import { S3StorageAdapter } from './s3-storage.adapter';

function makeClient(send: jest.Mock) {
  return { send } as unknown as S3Client;
}

describe('s3StorageAdapter', () => {
  let send: jest.Mock;
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    send = jest.fn();
    adapter = new S3StorageAdapter(makeClient(send), 'my-bucket');
  });

  it('uploads objects with a PutObjectCommand carrying the content type', async () => {
    send.mockResolvedValueOnce({});

    await adapter.put('exports/site/file.csv', Buffer.from('data'), {
      contentType: 'text/csv; charset=utf-8',
    });

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'exports/site/file.csv',
      ContentType: 'text/csv; charset=utf-8',
    });
  });

  it('returns the object body as a readable stream', async () => {
    const body = Readable.from(['hello']);
    send.mockResolvedValueOnce({ Body: body });

    const result = await adapter.getStream('exports/site/file.csv');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(result).toBe(body);
  });

  it('reports existence with a HeadObjectCommand', async () => {
    send.mockResolvedValueOnce({});

    await expect(adapter.exists('exports/site/file.csv')).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it.each([
    ['NotFound name', { name: 'NotFound' }],
    ['NoSuchKey name', { name: 'NoSuchKey' }],
    ['404 metadata', { $metadata: { httpStatusCode: 404 } }],
  ])('treats %s as a missing object', async (_label, error) => {
    send.mockRejectedValueOnce(error);

    await expect(adapter.exists('exports/site/missing.csv')).resolves.toBe(false);
  });

  it('rethrows unexpected errors from exists', async () => {
    send.mockRejectedValueOnce(new Error('connection reset'));

    await expect(adapter.exists('exports/site/file.csv')).rejects.toThrow('connection reset');
  });

  it('batch-deletes keys with a DeleteObjectsCommand', async () => {
    send.mockResolvedValueOnce({});

    await adapter.delete(['a.csv', 'b.csv']);

    const command = send.mock.calls[0]?.[0] as DeleteObjectsCommand;
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect(command.input.Delete?.Objects).toStrictEqual([{ Key: 'a.csv' }, { Key: 'b.csv' }]);
  });

  it('does not call S3 when deleting an empty key list', async () => {
    await adapter.delete([]);

    expect(send).not.toHaveBeenCalled();
  });
});
