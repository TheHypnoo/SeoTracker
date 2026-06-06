import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkSearchConsolePropertyDto {
  @ApiProperty({ description: 'Synced Search Console property id to link to the site.' })
  @IsUUID('4')
  searchConsolePropertyId!: string;
}
