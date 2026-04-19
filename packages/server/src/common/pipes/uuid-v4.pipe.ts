import { ParseUUIDPipe } from '@nestjs/common';

export const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });
