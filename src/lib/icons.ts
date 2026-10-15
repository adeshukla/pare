/**
 * A site's icon set from one picture (ADR-039): favicon.ico, the Apple touch
 * icon, the two manifest icons and a maskable one, the manifest that lists
 * them, and the tags to paste. The snippet philosophy (ADR-004) applied to
 * icons: Pare makes the files and says exactly where they go.
 */

/** Square sizes made, in pixels. 16, 32 and 48 go inside favicon.ico. */
export const ICON_SIZES = { ico: [16, 32, 48], apple: 180, small: 192, large: 512 } as const;

/** Fraction of a maskable icon the picture may fill: the safe zone is a circle of 80%. */
export const MASKABLE_FILL = 0.8;

/** favicon.ico holding PNG images, which every browser since IE Vista reads. */
export function buildIco(images: Array<{ size: number; png: Uint8Array }>): Uint8Array {
  const header = 6 + images.length * 16;
  const total = header + images.reduce((n, i) => n + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);
  let offset = header;
  images.forEach(({ size, png }, n) => {
    const e = 6 + n * 16;
    out[e] = size >= 256 ? 0 : size; // 0 means 256
    out[e + 1] = size >= 256 ? 0 : size;
    view.setUint16(e + 4, 1, true); // colour planes
    view.setUint16(e + 6, 32, true); // bits per pixel
    view.setUint32(e + 8, png.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/** The manifest's icon list, with a name to change. */
export function iconManifest(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    ) + '\n'
  );
}

export const ICON_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">`;
