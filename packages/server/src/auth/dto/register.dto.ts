import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

import { StrongPassword } from './password.constraints';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    description: 'At least 10 chars, 1 letter and 1 number.',
    example: 'CorrectHorse42',
  })
  @IsString()
  @StrongPassword()
  password!: string;
}
