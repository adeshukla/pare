/**
 * TIFF in (ADR-038). Only Safari displays TIFF, so it is decoded here, in
 * plain JavaScript (UTIF, from Photopea), and comes out in the formats every
 * browser reads. Loaded on first use; it never touches the initial bundle.
 */
export async function decodeTiff(bytes: Uint8Array): Promise<ImageData> {
  const { default: UTIF } = await import('utif2');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pages = UTIF.decode(buffer);
  const page = pages[0];
  if (!page) throw new Error('no image in this TIFF');
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  if (!page.width || !page.height || rgba.length !== page.width * page.height * 4) {
    throw new Error('this TIFF could not be decoded');
  }
  return new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length), page.width, page.height);
}

/**
 * How many pictures a TIFF holds - a scan can be several pages. Reduced-size
 * previews (NewSubfileType 1) are not pages.
 */
export async function tiffPages(bytes: Uint8Array): Promise<number> {
  const { default: UTIF } = await import('utif2');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return UTIF.decode(buffer).filter((ifd) => ((ifd as Record<string, number[] | undefined>)['t254']?.[0] ?? 0) !== 1).length;
}
