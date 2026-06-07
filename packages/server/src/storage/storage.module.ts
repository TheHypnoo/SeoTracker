import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { FilesystemStorageAdapter } from './filesystem-storage.adapter';
import { type ObjectStorage, OBJECT_STORAGE } from './object-storage';
import { S3StorageAdapter } from './s3-storage.adapter';

/**
 * Builds the active {@link ObjectStorage} adapter from configuration.
 *
 * `STORAGE_DRIVER=fs` → local disk (dev / docker-compose shared volume).
 * `STORAGE_DRIVER=s3` → S3-compatible bucket (R2 / S3 / B2 in production).
 * The S3 credentials are guaranteed present by the env-schema refinement.
 */
export function createObjectStorage(config: ConfigService<Env, true>): ObjectStorage {
  if (config.get('STORAGE_DRIVER', { infer: true }) === 's3') {
    const client = new S3Client({
      region: config.get('STORAGE_S3_REGION', { infer: true }),
      endpoint: config.get('STORAGE_S3_ENDPOINT', { infer: true }),
      forcePathStyle: config.get('STORAGE_S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('STORAGE_S3_ACCESS_KEY_ID', { infer: true }) ?? '',
        secretAccessKey: config.get('STORAGE_S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
      },
    });
    return new S3StorageAdapter(client, config.get('STORAGE_S3_BUCKET', { infer: true }) ?? '');
  }

  return new FilesystemStorageAdapter(config.get('STORAGE_FS_DIR', { infer: true }));
}

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: createObjectStorage,
      inject: [ConfigService],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
