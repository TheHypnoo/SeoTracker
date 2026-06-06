import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class TrackKeywordDto {
  @ApiProperty({ description: 'Search Console query (keyword) to start tracking for this site.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  query!: string;
}
