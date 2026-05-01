import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';

export function cn(...parts: ClassValue[]) {
  return clsx(parts);
}
