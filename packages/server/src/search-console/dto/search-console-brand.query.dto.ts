import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { SearchConsoleRangeQueryDto } from './search-console-range.query.dto';

export class SearchConsoleBrandQueryDto extends SearchConsoleRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated brand terms used to classify queries as branded vs non-branded.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  brandTerms?: string;
}
