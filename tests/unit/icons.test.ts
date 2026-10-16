import { describe, expect, it } from 'vitest';
import { buildIco, iconManifest } from '../../src/lib/icons';

describe('icon set (ADR-039)', () => {
  it('writes an ICO directory pointing at each PNG', () => {
    const a = Uint8Array.from([1, 2, 3]);
    const b = Uint8Array.from([4, 5]);
    const ico = buildIco([{ size: 16, png: a }, { size: 256, png: b }]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);
    // Entry 1: 16×16, 32 bpp, 3 bytes at offset 6 + 2×16.
    expect([ico[6], ico[7], view.getUint16(12, true), view.getUint32(14, true), view.getUint32(18, true)]).toEqual([16, 16, 32, 3, 38]);
    // Entry 2: 256 is written as 0.
    expect([ico[22], ico[23], view.getUint32(34, true)]).toEqual([0, 0, 41]);
    expect(Array.from(ico.subarray(38))).toEqual([1, 2, 3, 4, 5]);
  });

  it('lists the icons, maskable marked, under the name given', () => {
    const manifest = JSON.parse(iconManifest('logo'));
    expect(manifest.name).toBe('logo');
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);
    expect(manifest.icons[2].purpose).toBe('maskable');
  });
});
