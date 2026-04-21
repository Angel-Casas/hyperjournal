import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind utility classes with conflict resolution. Shadcn-style
 * helper — `cn('px-2 px-4', condition && 'text-red-500')` yields the
 * expected output.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
