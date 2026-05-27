import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAlertRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyOnScoreDrop?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  // Score is 0-100; cap the threshold so misconfigured rules can't ask for
  // an impossible drop.
  @Min(1)
  @Max(100)
  scoreDropThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyOnNewCriticalIssues?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyOnIssueCountIncrease?: boolean;
}
