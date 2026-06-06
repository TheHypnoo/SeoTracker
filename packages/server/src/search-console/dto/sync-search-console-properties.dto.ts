import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SyncSearchConsolePropertiesDto {
  @ApiProperty({ description: 'Google OAuth connection id used to call Search Console.' })
  @IsUUID('4')
  googleConnectionId!: string;
}
