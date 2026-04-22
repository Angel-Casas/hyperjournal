import { ZodError } from 'zod';

export type ImportErrorCopy = {
  readonly heading: string;
};

/**
 * Map a parse/validate/commit error from the import pipeline to human
 * copy per CONVENTIONS §12. Recognizes:
 *   - SyntaxError → JSON parse failure
 *   - ZodError with app-path issue → foreign-origin file
 *   - ZodError with formatVersion-path issue and value > 1 → newer version
 *   - Other ZodError → generic shape mismatch
 *   - Other Error → generic fallback
 */
export function importErrorCopyFor(error: unknown): ImportErrorCopy {
  if (error instanceof SyntaxError) {
    return {
      heading:
        "That file doesn't look like a HyperJournal export. Check the file is valid JSON.",
    };
  }
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      if (issue.path[0] === 'app') {
        return { heading: 'That file was exported from a different application.' };
      }
      if (issue.path[0] === 'formatVersion') {
        const received = issue.code === 'invalid_literal' ? issue.received : undefined;
        if (typeof received === 'number' && received > 1) {
          return {
            heading:
              'That file was exported from a newer version of HyperJournal. Update and try again.',
          };
        }
      }
    }
    return {
      heading:
        "That file is a HyperJournal export but the data doesn't match what this version understands. Please report this.",
    };
  }
  return { heading: 'Something went wrong. Try again.' };
}
