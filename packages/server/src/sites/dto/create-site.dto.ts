import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty()
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ example: 'Main Website' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'example.com' })
  @IsString()
  domain!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  timezone!: string;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
