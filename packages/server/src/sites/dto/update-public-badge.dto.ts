import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Toggle the public-badge opt-in for a site. */
export class UpdatePublicBadgeDto {
  @ApiProperty({ description: 'Si true, expone el badge SVG público para este site.' })
  @IsBoolean()
  enabled!: boolean;
}
