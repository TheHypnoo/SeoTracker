import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  // Optional fields use `field?: T | undefined` (not just `field?: T`) so that
  // `exactOptionalPropertyTypes` lets controllers build the DTO via spread or
  // by passing `{ limit: query.limit, offset: query.offset }` where the source
  // values are already `T | undefined`.

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number | undefined;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number | undefined;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export function resolvePagination(
  query: PaginationQueryDto | undefined,
  defaults: PaginationInput = { limit: 50, offset: 0 },
): PaginationInput {
  return {
    limit: query?.limit ?? defaults.limit,
    offset: query?.offset ?? defaults.offset,
  };
}
