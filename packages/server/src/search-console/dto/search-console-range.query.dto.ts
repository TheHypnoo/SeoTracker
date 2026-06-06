import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SearchConsoleRangeQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start date in YYYY-MM-DD format.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date in YYYY-MM-DD format.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Comparison-period start date (YYYY-MM-DD); enables per-row deltas in top lists.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  compareStartDate?: string;

  @ApiPropertyOptional({
    description: 'Comparison-period end date (YYYY-MM-DD) for per-row deltas.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  compareEndDate?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
