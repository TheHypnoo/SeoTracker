import { Inject, Injectable, Logger } from '@nestjs/common';
import { LogLevel } from '@seotracker/shared-types';

import { DRIZZLE } from '../database/database.constants';
import { systemLogContextSchema } from '../database/jsonb-schemas';
import type { Db } from '../database/database.types';
import { systemLogs } from '../database/schema';

type CreateSystemLogInput = {
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown> | undefined;
  trace?: string | undefined;
  auditRunId?: string | null | undefined;
};

@Injectable()
export class SystemLogsService {
  private readonly logger = new Logger(SystemLogsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async create(input: CreateSystemLogInput) {
    try {
      await this.db.insert(systemLogs).values({
        auditRunId: input.auditRunId ?? null,
        level: input.level,
        source: input.source,
        message: input.message,
        context: systemLogContextSchema.parse(input.context ?? {}),
        trace: input.trace,
      });
    } catch (error) {
      this.logger.warn(`Unable to persist system log: ${String(error)}`);
    }
  }

  error(
    source: string,
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
    auditRunId?: string | null,
  ) {
    return this.create({
      level: LogLevel.ERROR,
      source,
      message,
      context,
      auditRunId,
      trace: error instanceof Error ? error.stack : typeof error === 'string' ? error : undefined,
    });
  }

  warn(
    source: string,
    message: string,
    context?: Record<string, unknown>,
    auditRunId?: string | null,
  ) {
    return this.create({
      level: LogLevel.WARN,
      source,
      message,
      context,
      auditRunId,
    });
  }

  info(
    source: string,
    message: string,
    context?: Record<string, unknown>,
    auditRunId?: string | null,
  ) {
    return this.create({
      level: LogLevel.INFO,
      source,
      message,
      context,
      auditRunId,
    });
  }
}
