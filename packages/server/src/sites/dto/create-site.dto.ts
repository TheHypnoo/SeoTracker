import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsFQDN, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty()
  @IsUUID('4')
  projectId!: string;

  @ApiProperty({ example: 'Main Website' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'example.com' })
  // IsFQDN rejects URLs ("https://...") and IPs while accepting both apex and
  // subdomain forms ("example.com", "blog.example.com"). The service still
  // normalises the value with normalizeDomain() afterwards.
  @IsFQDN()
  domain!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  timezone!: string;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
