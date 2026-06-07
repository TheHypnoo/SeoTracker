import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FilesystemStorageAdapter } from './filesystem-storage.adapter';

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

describe('filesystemStorageAdapter', () => {
  let baseDir: string;
  let adapter: FilesystemStorageAdapter;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), 'seotracker-fs-storage-'));
    adapter = new FilesystemStorageAdapter(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { force: true, recursive: true });
  });

  it('writes, reads back, reports existence and deletes an object', async () => {
    const key = 'exports/site-1/abc/history.csv';

    await expect(adapter.exists(key)).resolves.toBe(false);

    await adapter.put(key, Buffer.from('Name\nExample\n', 'utf-8'));

    await expect(adapter.exists(key)).resolves.toBe(true);
    await expect(readStream(await adapter.getStream(key))).resolves.toBe('Name\nExample\n');

    await adapter.delete([key]);
    await expect(adapter.exists(key)).resolves.toBe(false);
  });

  it('ignores deletes for keys that do not exist', async () => {
    await expect(adapter.delete(['exports/missing/none.csv'])).resolves.toBeUndefined();
  });

  it('rejects keys that escape the base directory', async () => {
    await expect(adapter.put('../escape.csv', Buffer.from('x'))).rejects.toThrow(
      /outside the base directory/,
    );
  });

  it('rethrows non-ENOENT stat errors from exists', async () => {
    // A file standing where exists() expects a directory yields ENOTDIR, not ENOENT.
    await writeFile(path.join(baseDir, 'file'), 'x', 'utf-8');
    await expect(adapter.exists('file/child.csv')).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});
