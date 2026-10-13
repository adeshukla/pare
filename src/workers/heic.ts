/**
 * HEIC (iPhone photos) decoding through libheif, lazily loaded. ADR-026.
 *
 * Only Safari decodes HEIC natively, so everywhere else this is the path. The
 * module is ~1.9 MB with its WASM inlined; it is fetched the first time a HEIC
 * file is dropped, inside a worker, and never otherwise.
 *
 * libheif is LGPL-3.0. It is loaded unmodified, as its own file, from the
 * published package - see ADR-026 for what that means for Pare's licence.
 */

type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void,
  ): void;
  free?: () => void;
};

type LibHeif = { HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] } };

let ready: Promise<LibHeif> | undefined;

/** Load libheif now, for warmCodecs. */
export async function warmHeic(): Promise<void> {
  await load();
}

function load(): Promise<LibHeif> {
  ready ??= (async () => {
    const { default: factory } = (await import('libheif-js/libheif-wasm/libheif-bundle.mjs')) as {
      default: () => LibHeif | Promise<LibHeif>;
    };
    const lib = await factory();
    // Some emscripten builds finish instantiating after returning; wait for it.
    const pending = (lib as unknown as { ready?: Promise<unknown> }).ready;
    if (pending) await pending;
    return lib;
  })();
  return ready;
}

/** The primary image of a HEIC/HEIF file, as RGBA. Orientation is applied by libheif. */
export async function decodeHeic(bytes: Uint8Array): Promise<ImageData> {
  const lib = await load();
  const images = new lib.HeifDecoder().decode(bytes);
  const image = images[0];
  if (!image) throw new Error('no image in this HEIC file');

  try {
    const width = image.get_width();
    const height = image.get_height();
    const pixels = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (out) =>
        out ? resolve(out.data) : reject(new Error('HEIC could not be decoded')),
      );
    });
    return new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height);
  } finally {
    for (const img of images) img.free?.();
  }
}
