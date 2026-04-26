import { AuditStatus, AuditTrigger } from '@seotracker/shared-types';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSiteAuditsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional()
  @IsEnum(AuditTrigger)
  trigger?: AuditTrigger;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
