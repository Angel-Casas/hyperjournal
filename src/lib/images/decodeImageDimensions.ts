export type ImageDimensions = { width: number; height: number };

export async function decodeImageDimensions(blob: Blob): Promise<ImageDimensions> {
  const cib = (globalThis as { createImageBitmap?: typeof createImageBitmap })
    .createImageBitmap;
  if (typeof cib === 'function') {
    const bitmap = await cib(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close?.();
    }
  }
  return await decodeViaImageElement(blob);
}

function decodeViaImageElement(blob: Blob): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    img.addEventListener('load', () => {
      const dims = { width: img.width, height: img.height };
      cleanup();
      resolve(dims);
    });
    img.addEventListener('error', () => {
      cleanup();
      reject(new Error("couldn't decode image dimensions"));
    });
    img.src = url;
  });
}
