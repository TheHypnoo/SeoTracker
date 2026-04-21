import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Growth Team' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
