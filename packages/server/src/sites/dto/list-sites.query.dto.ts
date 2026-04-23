import { AuditStatus } from '@seotracker/shared-types';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSitesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  automation?: 'active' | 'inactive';
}
