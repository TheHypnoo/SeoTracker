import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  csrfToken!: string;

  @ApiProperty()
  user!: {
    id: string;
    email: string;
    name: string;
  };
}
