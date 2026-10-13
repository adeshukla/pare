import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { expandZips, safeEntryPath } from '../../src/lib/unzip';
import type { Asset } from '../../src/lib/types';

/** ADR-029: a zip in a drop is opened in place, and opened carefully. */

const asAsset = (path: string, bytes: Uint8Array): Asset => ({
  path,
  bytes,
  kind: 'other',
  mime: 'application/zip',
  refs: [],
  resolvable: false,
});

describe('safeEntryPath', () => {
  it('keeps ordinary paths and normalises backslashes', () => {
    expect(safeEntryPath('mytheme/style.css')).toBe('mytheme/style.css');
    expect(safeEntryPath('mytheme\\js\\app.js')).toBe('mytheme/js/app.js');
    expect(safeEntryPath('./a//b.png')).toBe('a/b.png');
  });

  it('drops anything that climbs out, and archive litter', () => {
    expect(safeEntryPath('../../etc/passwd')).toBeUndefined();
    expect(safeEntryPath('theme/../../x')).toBeUndefined();
    expect(safeEntryPath('__MACOSX/theme/._style.css')).toBeUndefined();
    expect(safeEntryPath('theme/.DS_Store')).toBeUndefined();
    expect(safeEntryPath('theme/node_modules/x.js')).toBeUndefined();
  });
});

describe('expandZips', () => {
  it('replaces a zip with its contents, at the zip’s own location', async () => {
    const inner = zipSync({ 'deep.txt': strToU8('x') });
    const zip = zipSync({
      'mytheme/style.css': strToU8('body{margin:0}'),
      'mytheme/header.php': strToU8('<?php ?>'),
      '__MACOSX/mytheme/._style.css': strToU8('junk'),
      'mytheme/.DS_Store': strToU8('junk'),
      'mytheme/bundle.zip': inner,
    });
    const other = asAsset('readme.txt', strToU8('hi'));
    const { assets, notes } = await expandZips([other, asAsset('themes/mytheme.zip', zip)], 5000);

    expect(assets.map((a) => a.path).sort()).toEqual([
      'readme.txt',
      'themes/mytheme/bundle.zip',
      'themes/mytheme/header.php',
      'themes/mytheme/style.css',
    ]);
    // Contents are classified like any dropped file; a zip inside is left shut.
    expect(assets.find((a) => a.path.endsWith('style.css'))!.kind).toBe('css');
    expect(assets.find((a) => a.path.endsWith('header.php'))!.kind).toBe('template');
    expect(assets.find((a) => a.path.endsWith('bundle.zip'))!.kind).toBe('other');
    expect(notes.join(' ')).toMatch(/Opened themes\/mytheme\.zip: 3 files/);
  });

  it('refuses an archive over the file limit and keeps it as a file', async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 12; i++) files[`f${i}.txt`] = strToU8('x');
    const zip = asAsset('many.zip', zipSync(files));
    const { assets, notes } = await expandZips([zip], 10);
    expect(assets).toEqual([zip]);
    expect(notes.join(' ')).toMatch(/more than 10 files/);
  });

  it('keeps an unreadable zip as a file and says why', async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const { assets, notes } = await expandZips([asAsset('broken.zip', broken)], 5000);
    expect(assets.map((a) => a.path)).toEqual(['broken.zip']);
    expect(notes.join(' ')).toMatch(/Could not open broken\.zip/);
  });

  it('leaves a file that merely ends in .zip but is not one', async () => {
    const fake = asAsset('notes.zip', strToU8('not a zip'));
    const { assets, notes } = await expandZips([fake], 5000);
    expect(assets).toEqual([fake]);
    expect(notes).toEqual([]);
  });
});
