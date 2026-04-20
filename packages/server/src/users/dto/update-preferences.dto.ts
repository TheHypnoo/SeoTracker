import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  activeProjectId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailOnAuditCompleted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailOnAuditRegression?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailOnCriticalIssues?: boolean;
}
