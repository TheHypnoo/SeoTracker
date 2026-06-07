import type { Readable } from 'node:stream';

/**
 * DI token for the active {@link ObjectStorage} implementation. The concrete
 * adapter (filesystem in dev, S3-compatible in production) is selected by
 * `STORAGE_DRIVER` in {@link StorageModule}.
 */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PutObjectOptions {
  /** MIME type stored alongside the object (used by the S3 driver). */
  contentType?: string;
}

/**
 * Minimal object-storage port the app codes against. Keeping the surface tiny
 * lets the filesystem and S3 adapters stay interchangeable: exports are written
 * by the worker and read by the API, which are separate processes that never
 * share a disk in production — so both sides must talk to the same backing
 * store through this interface, not through `node:fs`.
 */
export interface ObjectStorage {
  /** Upload (or overwrite) the object at `key`. */
  put(key: string, body: Buffer, options?: PutObjectOptions): Promise<void>;
  /** Open a readable stream for the object at `key`. */
  getStream(key: string): Promise<Readable>;
  /** Whether an object exists at `key`. */
  exists(key: string): Promise<boolean>;
  /** Best-effort delete; missing keys are ignored. */
  delete(keys: string[]): Promise<void>;
}
