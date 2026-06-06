import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ImportSearchConsoleDataDto {
  @ApiPropertyOptional({ description: 'Inclusive start date in YYYY-MM-DD format.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date in YYYY-MM-DD format.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;
}
