import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutboundEvent } from '@seotracker/shared-types';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOutboundWebhookDto {
  @ApiProperty({ example: 'Slack alerts' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'https://hooks.example.com/seotracker' })
  @IsUrl({ require_protocol: true, require_tld: false })
  url!: string;

  @ApiPropertyOptional({ example: 'Authorization' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headerName?: string;

  @ApiPropertyOptional({ example: 'Bearer abc123' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  headerValue?: string;

  @ApiProperty({
    description: 'Eventos suscritos',
    enum: OutboundEvent,
    example: [OutboundEvent.AUDIT_COMPLETED],
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(OutboundEvent, { each: true })
  events!: OutboundEvent[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
