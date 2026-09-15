export async function compressProgressImage(file: File) {
  const hasImageExtension = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!(file.type.startsWith("image/") || hasImageExtension)) {
    throw new Error("Choose a photo from your camera or photo library.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Could not read ${file.name}. Please choose the photo again.`);
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // JPEG is deliberately requested here because iOS Safari may ignore a WebP
  // request and return PNG bytes. Always trust the Blob's actual MIME type.
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .84));
  if (!blob) throw new Error(`Could not prepare ${file.name}.`);
  if (blob.size > 4 * 1024 * 1024) throw new Error(`${file.name} is still too large after compression.`);
  const outputTypes: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  const extension = outputTypes[blob.type];
  if (!extension) throw new Error(`Could not prepare ${file.name} in a supported format.`);
  const basename = file.name.replace(/\.[^.]+$/, "") || "progress-photo";
  return new File([blob], `${basename}${extension}`, { type: blob.type });
}
