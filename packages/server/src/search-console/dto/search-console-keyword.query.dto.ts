import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SearchConsoleRangeQueryDto } from './search-console-range.query.dto';

export class SearchConsoleKeywordQueryDto extends SearchConsoleRangeQueryDto {
  @ApiProperty({
    description: 'The tracked Search Console query to return a daily timeseries for.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  query!: string;
}
