import { Permission, Role } from '@seotracker/shared-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsEnum, IsOptional } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ default: Role.MEMBER, enum: [Role.MEMBER, Role.VIEWER] })
  @IsEnum(Role)
  role: Role = Role.MEMBER;

  @ApiPropertyOptional({ enum: Permission, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  extraPermissions?: Permission[];

  @ApiPropertyOptional({ enum: Permission, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  revokedPermissions?: Permission[];
}
