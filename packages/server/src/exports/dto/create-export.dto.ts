import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExportFormat, ExportKind } from '@seotracker/shared-types';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateExportDto {
  @ApiProperty({ enum: ExportKind })
  @IsEnum(ExportKind)
  kind!: ExportKind;

  @ApiProperty({ default: ExportFormat.CSV, enum: ExportFormat })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  auditRunId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  comparisonId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
