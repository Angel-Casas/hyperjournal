export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string result'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
