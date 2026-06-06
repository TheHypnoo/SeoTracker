import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { SearchConsoleRangeQueryDto } from './search-console-range.query.dto';

export class SearchConsoleKeywordQueryDto extends SearchConsoleRangeQueryDto {
  @ApiProperty({
    description: 'The tracked Search Console query to return a daily timeseries for.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  query!: string;

  @ApiPropertyOptional({ description: 'Segment by an ISO-3166 alpha-3 country code (e.g. ESP).' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  country?: string;

  @ApiPropertyOptional({ description: 'Segment by device: DESKTOP, MOBILE or TABLET.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  device?: string;
}
