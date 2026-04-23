import { ScheduleFrequency } from '@seotracker/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertScheduleDto {
  @ApiProperty({ enum: ScheduleFrequency })
  @IsEnum(ScheduleFrequency)
  frequency!: ScheduleFrequency;

  @ApiProperty({
    description: '0=Sunday ... 6=Saturday. Required when frequency is WEEKLY.',
    required: false,
  })
  @ValidateIf((o: UpsertScheduleDto) => o.frequency === ScheduleFrequency.WEEKLY)
  @IsDefined({ message: 'dayOfWeek is required when frequency is WEEKLY' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  timeOfDay!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  timezone!: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
