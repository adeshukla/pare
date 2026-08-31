import { describe, expect, it } from 'vitest';
import { pictureSnippet, srcset, type Variant } from '../../src/lib/snippet';
import { splitPath, variantPath } from '../../src/lib/naming';

const v = (format: Variant['format'], mime: string, width: number, path: string): Variant => ({
  format,
  mime,
  width,
  path,
  bytes: width * 10,
});

const SAMPLE: Variant[] = [
  v('avif', 'image/avif', 800, 'img/hero-800.avif'),
  v('avif', 'image/avif', 400, 'img/hero-400.avif'),
  v('webp', 'image/webp', 400, 'img/hero-400.webp'),
  v('webp', 'image/webp', 800, 'img/hero-800.webp'),
  v('fallback', 'image/jpeg', 400, 'img/hero-400.jpg'),
  v('fallback', 'image/jpeg', 800, 'img/hero-800.jpg'),
];

const base = {
  sourcePath: 'img/hero.jpg',
  variants: SAMPLE,
  naturalWidth: 800,
  naturalHeight: 450,
  imgSrc: 'img/hero-400.jpg',
  sizes: '(max-width: 768px) 100vw, 50vw',
  lazy: true,
  alt: '',
};

describe('srcset', () => {
  it('sorts ascending by width regardless of input order', () => {
    expect(srcset(SAMPLE.filter((x) => x.format === 'avif'))).toBe(
      'img/hero-400.avif 400w, img/hero-800.avif 800w',
    );
  });
});

describe('pictureSnippet', () => {
  const html = pictureSnippet(base);

  it('offers AVIF before WebP, since the browser takes the first it can decode', () => {
    expect(html.indexOf('image/avif')).toBeLessThan(html.indexOf('image/webp'));
  });

  it('carries width and height so the page does not shift as images load', () => {
    expect(html).toContain('width="800"');
    expect(html).toContain('height="450"');
  });

  it('emits the sizes attribute on every source', () => {
    expect(html.match(/sizes="/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('honours the lazy toggle', () => {
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(pictureSnippet({ ...base, lazy: false })).not.toContain('loading=');
  });

  it('paints the placeholder behind the image when there is one', () => {
    const withHash = pictureSnippet({ ...base, placeholder: 'data:image/png;base64,AAA' });
    expect(withHash).toContain('background-image:url(data:image/png;base64,AAA)');
    expect(html).not.toContain('background-image');
  });

  it('escapes anything that would break out of an attribute', () => {
    const nasty = pictureSnippet({
      ...base,
      imgSrc: 'img/a"onerror="alert(1).jpg',
      alt: 'Tom & Jerry <b>',
    });
    expect(nasty).toContain('&quot;onerror=&quot;');
    expect(nasty).toContain('alt="Tom &amp; Jerry &lt;b&gt;"');
  });

  it('returns nothing at all when there is nothing to point at', () => {
    expect(pictureSnippet({ ...base, variants: [] })).toBe('');
  });

  it('only gives the img a srcset when there is more than one fallback width', () => {
    const single = SAMPLE.filter((x) => x.format !== 'fallback').concat(
      v('fallback', 'image/jpeg', 800, 'img/hero-800.jpg'),
    );
    const out = pictureSnippet({ ...base, variants: single });
    expect(out).not.toMatch(/<img [^>]*srcset=/);
  });
});

describe('naming', () => {
  it('splits nested paths, dotfiles and extensionless names', () => {
    expect(splitPath('img/photos/hero.jpg')).toEqual({
      dir: 'img/photos',
      stem: 'hero',
      ext: 'jpg',
    });
    expect(splitPath('hero.JPEG').ext).toBe('jpeg');
    expect(splitPath('LICENSE')).toEqual({ dir: '', stem: 'LICENSE', ext: '' });
    expect(splitPath('.gitignore')).toEqual({ dir: '', stem: '.gitignore', ext: '' });
  });

  it('keeps the source folder structure and appends width plus format', () => {
    expect(variantPath('img/hero.jpg', 800, 'image/avif')).toBe('img/hero-800.avif');
    expect(variantPath('hero.png', 1600, 'image/png')).toBe('hero-1600.png');
    expect(variantPath('a/b/c.gif', 400, 'image/jpeg')).toBe('a/b/c-400.jpg');
  });
});
