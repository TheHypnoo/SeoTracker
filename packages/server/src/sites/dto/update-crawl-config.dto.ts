import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Per-site crawler tuning. All fields optional — caller patches what they need.
 * Hard caps mirror the runtime guards in CrawlConfigService.validate.
 */
export class UpdateCrawlConfigDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxPages?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxDepth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxConcurrentPages?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  requestDelayMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  respectCrawlDelay?: boolean;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userAgent?: string | null;
}
