import { describe, expect, it } from 'vitest';
import { scanHtml } from '../../src/lib/html-scan';
import { isAnimatedGif } from '../../src/lib/metadata';
import {
  imageSensitiveSelector,
  scriptTouchesImages,
  scriptsBlockWrapping,
  wrapImages,
  type ModernCopies,
} from '../../src/lib/picture-wrap';

/**
 * ADR-021: folder mode may wrap an <img> in a <picture>. Every case here is a
 * way that wrap could change what a page matches or shows, and so must refuse.
 */

const files = new Set(['img/hero.jpg', 'img/hero.avif', 'img/hero.webp', 'js/app.js']);
const exists = (p: string) => files.has(p);
const modern = new Map<string, ModernCopies>([
  ['img/hero.jpg', { avif: 'img/hero.avif', webp: 'img/hero.webp' }],
]);

describe('wrapImages', () => {
  it('wraps a plain img and leaves the original tag byte-for-byte', () => {
    const html = '<p>x</p><img src="img/hero.jpg" alt="Hero" width=80><p>y</p>';
    const out = wrapImages(html, 'index.html', modern, exists, undefined);
    expect(out.wrapped).toEqual(['img/hero.jpg']);
    expect(out.text).toBe(
      '<p>x</p><picture><source type="image/avif" srcset="img/hero.avif">' +
        '<source type="image/webp" srcset="img/hero.webp">' +
        '<img src="img/hero.jpg" alt="Hero" width=80></picture><p>y</p>',
    );
  });

  it('keeps the address shape: ../ prefix and query string survive', () => {
    const out = wrapImages('<img src="../img/hero.jpg?v=2">', 'blog/post.html', modern, exists, undefined);
    expect(out.text).toContain('srcset="../img/hero.avif?v=2"');
    expect(out.text).toContain('<img src="../img/hero.jpg?v=2">');
  });

  it('wraps adjacent images without interleaving their wrappers', () => {
    const out = wrapImages('<img src="img/hero.jpg"><img src="img/hero.jpg">', 'a.html', modern, exists, undefined);
    expect(out.wrapped).toHaveLength(2);
    expect(out.text.match(/<picture>/g)).toHaveLength(2);
    expect(out.text).toMatch(/<\/picture><picture>/);
    expect(scanHtml(out.text).imgs.every((i) => i.inPicture)).toBe(true);
  });

  it('leaves an image already inside a picture alone', () => {
    const html = '<picture><img src="img/hero.jpg"></picture>';
    expect(wrapImages(html, 'a.html', modern, exists, undefined).text).toBe(html);
  });

  it('refuses images with their own srcset or a lazy-loader attribute', () => {
    const html = '<img src="img/hero.jpg" srcset="img/hero.jpg 2x"><img src="img/hero.jpg" data-src="x.jpg">';
    const out = wrapImages(html, 'a.html', modern, exists, undefined);
    expect(out.text).toBe(html);
    expect(out.skipped).toHaveLength(2);
  });

  it('refuses every image on a page whose scripts are not cleared', () => {
    const html = '<img src="img/hero.jpg">';
    const out = wrapImages(html, 'a.html', modern, exists, 'because a script said so');
    expect(out.text).toBe(html);
    expect(out.skipped).toEqual(['because a script said so']);
  });

  it('ignores images with no copies, and images it cannot resolve', () => {
    const html = '<img src="img/other.png"><img src="{{ x }}/hero.jpg"><img src="https://x.test/hero.jpg">';
    const out = wrapImages(html, 'a.html', modern, exists, undefined);
    expect(out.text).toBe(html);
    expect(out.skipped).toEqual([]);
  });

  it('offers only the copies that exist', () => {
    const only = new Map([['img/hero.jpg', { webp: 'img/hero.webp' }]]);
    const out = wrapImages('<img src="img/hero.jpg">', 'a.html', only, exists, undefined);
    expect(out.text).not.toContain('image/avif');
    expect(out.text).toContain('type="image/webp"');
  });
});

describe('imageSensitiveSelector', () => {
  it.each([
    ['.gallery > img { width: 50% }', '.gallery > img'],
    ['.card>img{display:block}', '.card>img'],
    ['img + p { margin-top: 0 }', 'img + p'],
    ['.x img.hero ~ span { color: red }', '.x img.hero ~ span'],
    ['img:first-child { float: left }', 'img:first-child'],
    ['.row img:nth-child(2n) { opacity: .5 }', '.row img:nth-child(2n)'],
    ['figure:has(> img) { padding: 0 }', 'figure:has(> img)'],
    ['picture { display: block }', 'picture'],
    ['@media (width >= 768px) { .a, .b > img { x: y } }', '.b > img'],
  ])('flags %s', (css, selector) => {
    expect(imageSensitiveSelector(css)).toBe(selector);
  });

  it.each([
    'img { max-width: 100% }',
    '.card img { border-radius: 4px }',
    '.img-wrapper + p { margin: 0 }',
    '.thumbnail > .img-box { x: y }',
    '/* .gallery > img */ .a { color: red }',
    'a:first-child { color: red }',
  ])('does not flag %s', (css) => {
    expect(imageSensitiveSelector(css)).toBeUndefined();
  });
});

describe('scripts', () => {
  it('spots a script that sets an image address', () => {
    expect(scriptTouchesImages("document.querySelector('#slot').src = GALLERY[0];")).toBe(true);
    expect(scriptTouchesImages("img.setAttribute('srcset', s)")).toBe(true);
    expect(scriptTouchesImages('if (img.src === x) {}')).toBe(false);
    expect(scriptTouchesImages('console.log("hello")')).toBe(false);
  });

  const scripts = new Map([['js/app.js', 'var x = 1;']]);

  it('clears a page whose own scripts leave images alone', () => {
    const html = '<script src="js/app.js"></script><script>var y = 2;</script>';
    expect(scriptsBlockWrapping(html, 'index.html', scripts, exists)).toBeUndefined();
  });

  it('blocks on an inline script, an inline handler, or a local script that touches images', () => {
    expect(scriptsBlockWrapping('<script>i.src = "a"</script>', 'a.html', scripts, exists)).toBeDefined();
    expect(scriptsBlockWrapping('<img onclick="this.src=\'b.jpg\'">', 'a.html', scripts, exists)).toBeDefined();
    const touching = new Map([['js/app.js', 'el.src = next;']]);
    expect(scriptsBlockWrapping('<script src="js/app.js"></script>', 'a.html', touching, exists)).toBeDefined();
  });

  it('blocks on a script it cannot read', () => {
    const reason = scriptsBlockWrapping(
      '<script src="https://cdn.test/lightbox.js"></script>',
      'a.html',
      scripts,
      exists,
    );
    expect(reason).toContain('https://cdn.test/lightbox.js');
  });

  it('checks every script when the page loads a module', () => {
    const touching = new Map([['js/app.js', 'var x;'], ['js/other.js', 'el.src = next;']]);
    const html = '<script type="module" src="js/app.js"></script>';
    expect(scriptsBlockWrapping(html, 'a.html', touching, exists)).toBeDefined();
  });
});

describe('isAnimatedGif', () => {
  /** A minimal GIF: 1x1, global palette of two colours, `frames` images. */
  function gif(frames: number): Uint8Array {
    const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0];
    const palette = [0, 0, 0, 255, 255, 255];
    const frame = [
      0x21, 0xf9, 4, 0, 10, 0, 0, 0, // graphic control extension, with a delay
      0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, // image descriptor, no local palette
      2, 2, 0x4c, 0x01, 0, // LZW min code size, one data sub-block, terminator
    ];
    return new Uint8Array([...header, ...palette, ...Array(frames).fill(frame).flat(), 0x3b]);
  }

  it('reads a single frame as still and two as animated', () => {
    expect(isAnimatedGif(gif(1))).toBe(false);
    expect(isAnimatedGif(gif(2))).toBe(true);
  });

  it('is false for anything that is not a GIF, or is cut short', () => {
    expect(isAnimatedGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isAnimatedGif(gif(2).slice(0, 20))).toBe(false);
  });
});
