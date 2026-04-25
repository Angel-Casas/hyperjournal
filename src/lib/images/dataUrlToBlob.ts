import { ALLOWED_MIMES, type AllowedMime } from './validateImageBlob';

const PATTERN = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = PATTERN.exec(dataUrl);
  if (!match) {
    if (!dataUrl.startsWith('data:')) {
      throw new Error('malformed data URL: missing "data:" prefix');
    }
    if (!dataUrl.includes(';base64,')) {
      throw new Error('malformed data URL: missing ";base64," marker');
    }
    throw new Error('malformed data URL: unsupported MIME');
  }
  const mime = match[1] as AllowedMime;
  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error(`malformed data URL: MIME "${mime}" not allowed`);
  }
  const base64 = match[2]!;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
