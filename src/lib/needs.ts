import type { Settings } from './optimize';
import type { OutputFormat } from './settings';
import type { Asset } from './types';

/**
 * The codecs a job will load, by the names the worker's warm() understands.
 * Used so that only one worker fetches each codec first (see pool.run).
 */
export function codecFor(format: OutputFormat, mime: string): string {
  if (format !== 'fallback') return format;
  return mime === 'image/png' || mime === 'image/gif' || mime === 'image/bmp' ? 'png' : 'jpeg';
}

export function needsFor(asset: Asset, settings: Settings, format?: OutputFormat): string[] {
  const text = settings.text;
  const transport = text.brotli ? ['brotli'] : [];
  switch (asset.kind) {
    case 'image': {
      const formats = format
        ? [format]
        : (['avif', 'webp', 'fallback'] as const).filter((f) => settings.image.formats[f]);
      return [
        ...(asset.mime === 'image/heic' ? ['heic'] : []),
        'resize',
        ...formats.map((f) => codecFor(f, asset.mime)),
      ];
    }
    case 'font':
      return ['harfbuzz', 'woff2'];
    case 'css':
      return ['lightning', ...transport];
    case 'js':
      return ['esbuild', ...(text.jsLevel === 'max' ? ['terser'] : []), ...transport];
    case 'html':
      return ['html', 'lightning', 'esbuild', ...transport];
    case 'svg':
      return ['svgo', ...transport];
    default:
      return [];
  }
}
