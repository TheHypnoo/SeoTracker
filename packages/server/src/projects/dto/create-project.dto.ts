import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Growth Team' })
  @IsString()
  @MinLength(2)
  name!: string;
}
