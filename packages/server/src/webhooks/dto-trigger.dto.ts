import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TriggerWebhookAuditDto {
  @ApiProperty()
  @IsUUID('4')
  siteId!: string;
}
