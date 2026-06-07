import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class EngineHealthQueryDto {
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class EngineHealthTimeseriesQueryDto extends EngineHealthQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stage?: string;
}
