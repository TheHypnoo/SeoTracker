import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import type { ObjectStorage } from './object-storage';

/**
 * Stores objects on the local filesystem under a single base directory.
 *
 * Used for local development and docker-compose, where the API and worker
 * either share the host filesystem (`pnpm dev`) or a named volume mounted into
 * both containers. NOT a fit for Railway, where each service has its own
 * ephemeral disk — production uses {@link S3StorageAdapter} instead.
 */
export class FilesystemStorageAdapter implements ObjectStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  getStream(key: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.resolveKey(key)));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolveKey(key), { force: true })));
  }

  /**
   * Map an object key to an absolute path, refusing keys that would escape the
   * base directory (e.g. `../../etc/passwd`). Object keys are derived from
   * internal ids, but the guard keeps the adapter safe if that ever changes.
   */
  private resolveKey(key: string): string {
    const target = path.resolve(this.baseDir, key);
    if (target !== this.baseDir && !target.startsWith(this.baseDir + path.sep)) {
      throw new Error(`Refusing to access storage key outside the base directory: ${key}`);
    }
    return target;
  }
}
