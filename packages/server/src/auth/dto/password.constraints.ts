import { applyDecorators } from '@nestjs/common';
import { Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULES_MESSAGE =
  'Password must be at least 10 characters and include at least one letter and one number';

/**
 * Single source of truth for password complexity. Apply with `@StrongPassword()`
 * on any DTO field that accepts a new password (register, password reset, etc.).
 */
export function StrongPassword() {
  return applyDecorators(
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULES_MESSAGE }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    }),
    Matches(/[A-Za-z]/, { message: PASSWORD_RULES_MESSAGE }),
    Matches(/\d/, { message: PASSWORD_RULES_MESSAGE }),
  );
}
