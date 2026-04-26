import { AuditStatus, AuditTrigger } from '@seotracker/shared-types';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListProjectAuditsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional()
  @IsEnum(AuditTrigger)
  trigger?: AuditTrigger;
}
