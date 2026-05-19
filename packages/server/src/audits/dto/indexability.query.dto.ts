import { IndexabilityStatus } from '@seotracker/shared-types';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class IndexabilityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IndexabilityStatus)
  indexabilityStatus?: IndexabilityStatus;

  @IsOptional()
  @IsString()
  source?: string;
}
