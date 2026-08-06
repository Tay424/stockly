import sharp from "sharp";

/** Longest edge for the full receipt (enough for zoom, much smaller than phone originals). */
export const FULL_MAX_EDGE = 1600;
/** Preview thumbnail for dialogs / lists. */
export const THUMB_MAX_EDGE = 480;
const FULL_QUALITY = 75;
const THUMB_QUALITY = 70;

/**
 * Resize + WebP-compress a receipt. Returns full + thumb buffers.
 * EXIF orientation is applied so phone photos aren't sideways.
 */
export async function optimizeReceiptBuffers(input) {
  const meta = await sharp(input, { failOn: "none" }).metadata();

  const full = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: FULL_MAX_EDGE,
      height: FULL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: FULL_QUALITY, effort: 4 })
    .toBuffer();

  const thumb = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toBuffer();

  return {
    full,
    thumb,
    mime: "image/webp",
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
