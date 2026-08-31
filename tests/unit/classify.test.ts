import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/lib/classify';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));

describe('classify', () => {
  it('reads a real JPEG from its magic bytes', () => {
    expect(classify('photo.jpg', fixture('photo.jpg'))).toEqual({
      kind: 'image',
      mime: 'image/jpeg',
    });
  });

  it('reads a real PNG from its magic bytes', () => {
    expect(classify('flat.png', fixture('flat.png'))).toEqual({
      kind: 'image',
      mime: 'image/png',
    });
  });

  it('trusts the bytes over the extension', () => {
    // A PNG saved as .jpg is common in the wild. Handing it to a JPEG decoder
    // produces a confusing failure, so the signature has to win.
    const png = fixture('flat.png');
    expect(classify('actually-a-png.jpg', png).mime).toBe('image/png');
  });

  it('falls back to the extension for text formats with no signature', () => {
    const empty = new Uint8Array([0x2f, 0x2a, 0x20, 0x2a, 0x2f]);
    expect(classify('a/b/styles.css', empty).kind).toBe('css');
    expect(classify('app.mjs', empty).kind).toBe('js');
    expect(classify('index.html', empty).kind).toBe('html');
    expect(classify('logo.svg', empty).kind).toBe('svg');
  });

  it('calls anything it cannot place "other" rather than guessing', () => {
    expect(classify('notes.xyz', new Uint8Array([1, 2, 3]))).toEqual({
      kind: 'other',
      mime: 'application/octet-stream',
    });
  });

  it('does not read past the end of a very short file', () => {
    expect(() => classify('t.bin', new Uint8Array([0xff]))).not.toThrow();
    expect(() => classify('t.bin', new Uint8Array())).not.toThrow();
  });
});
