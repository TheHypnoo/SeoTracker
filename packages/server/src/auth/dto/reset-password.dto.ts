import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { StrongPassword } from './password.constraints';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({
    description: 'At least 10 chars, 1 letter and 1 number.',
    example: 'CorrectHorse42',
  })
  @IsString()
  @StrongPassword()
  password!: string;
}
