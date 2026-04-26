import { IssueCategory, IssueState, Severity } from '@seotracker/shared-types';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListProjectIssuesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @IsOptional()
  @IsEnum(IssueCategory)
  category?: IssueCategory;

  @IsOptional()
  @IsEnum(IssueState)
  state?: IssueState;
}
