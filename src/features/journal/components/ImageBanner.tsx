export const BANNER_COPY = {
  'too-big': 'Image rejected: max 5 MB.',
  'wrong-mime': 'Only PNG, JPEG, WebP, and GIF are supported.',
  'decode': "Couldn't read image.",
  'cap': 'Up to 10 images per entry.',
  'storage': 'Out of browser storage. Try removing old screenshots or wallets.',
} as const;

export type BannerReason = keyof typeof BANNER_COPY;

export function ImageBanner({ reason }: { reason: BannerReason }) {
  return (
    <p role="alert" className="text-sm text-warning">
      {BANNER_COPY[reason]}
    </p>
  );
}
