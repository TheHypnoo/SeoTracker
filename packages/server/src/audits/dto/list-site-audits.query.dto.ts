import { AuditStatus, AuditTrigger } from '@seotracker/shared-types';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSiteAuditsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional()
  @IsEnum(AuditTrigger)
  trigger?: AuditTrigger;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
