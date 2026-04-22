import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import { importErrorCopyFor } from './import-errors';

describe('importErrorCopyFor', () => {
  it('returns the JSON-parse message for SyntaxError', () => {
    const copy = importErrorCopyFor(new SyntaxError('Unexpected token'));
    expect(copy.heading).toMatch(/valid JSON/i);
  });

  it('returns the foreign-app message when the Zod issue points at the app field', () => {
    const schema = z.object({ app: z.literal('HyperJournal') });
    try {
      schema.parse({ app: 'SomethingElse' });
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/different application/i);
      return;
    }
    throw new Error('expected ZodError');
  });

  it('returns the newer-version message when a formatVersion issue has a value > 1', () => {
    const schema = z.object({ formatVersion: z.literal(1) });
    try {
      schema.parse({ formatVersion: 2 });
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/newer version/i);
      return;
    }
    throw new Error('expected ZodError');
  });

  it('returns a generic shape-mismatch message for other ZodErrors', () => {
    const schema = z.object({ somethingElse: z.string() });
    try {
      schema.parse({});
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/doesn.t match/i);
    }
  });

  it('returns a generic fallback for an unknown error', () => {
    const copy = importErrorCopyFor(new Error('boom'));
    expect(copy.heading).toMatch(/something went wrong/i);
  });
});
