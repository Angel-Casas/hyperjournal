export const ALLOWED_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export const MAX_BYTES = 5 * 1024 * 1024;

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: 'too-big' | 'wrong-mime' };

export function validateImageBlob(blob: Blob): ValidateResult {
  if (!ALLOWED_MIMES.includes(blob.type as AllowedMime)) {
    return { ok: false, reason: 'wrong-mime' };
  }
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    return { ok: false, reason: 'too-big' };
  }
  return { ok: true };
}
