import { describe, expect, it } from 'vitest';
import { fromDataTransfer, fromFileList } from '../../src/lib/ingest';

/**
 * The drag-drop folder walk.
 *
 * This is the path every non-Chromium browser takes, and it was the least
 * verified code in the repo for four phases: every other test reaches the app
 * through `<input type=file>`, which hands over a flat list and never exercises
 * the recursive `webkitGetAsEntry` walk at all.
 *
 * The entries API is old and awkward - callback-based, and `readEntries` returns
 * at most 100 items per call, so a directory of 250 files needs three calls and a
 * loop that knows to keep asking. That loop is what these fakes are here to
 * exercise.
 */

type Entry = FileSystemEntry;

function fileEntry(name: string, contents: string): Entry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `/${name}`,
    filesystem: null as never,
    file: (resolve: (f: File) => void) => resolve(new File([contents], name)),
  } as unknown as Entry;
}

/**
 * A directory whose reader hands back at most `batch` entries per call, then an
 * empty array - exactly how the real API behaves.
 */
function dirEntry(name: string, children: Entry[], batch = 100): Entry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    filesystem: null as never,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (resolve: (entries: Entry[]) => void) => {
          const slice = children.slice(offset, offset + batch);
          offset += slice.length;
          resolve(slice);
        },
      };
    },
  } as unknown as Entry;
}

/** A DataTransfer whose items expose entries, as a real folder drop does. */
function drop(roots: Entry[], files: File[] = []): DataTransfer {
  return {
    items: roots.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files,
  } as unknown as DataTransfer;
}

/** A DataTransfer with no entries at all - a plain multi-file drop. */
function plainDrop(files: File[]): DataTransfer {
  return {
    items: files.map(() => ({ kind: 'file', webkitGetAsEntry: () => null })),
    files,
  } as unknown as DataTransfer;
}

const paths = (assets: { path: string }[]) => assets.map((a) => a.path).sort();

describe('fromDataTransfer', () => {
  it('walks a dropped folder and keeps the path of every file', async () => {
    const assets = await fromDataTransfer(
      drop([
        dirEntry('site', [
          fileEntry('index.html', '<!doctype html><p>hi</p>'),
          dirEntry('css', [fileEntry('site.css', '.a{color:red}')]),
          dirEntry('img', [dirEntry('deep', [fileEntry('hero.svg', '<svg></svg>')])]),
        ]),
      ]),
    );

    expect(paths(assets)).toEqual([
      'site/css/site.css',
      'site/img/deep/hero.svg',
      'site/index.html',
    ]);
  });

  it('classifies what it walked, rather than trusting the extension', async () => {
    const assets = await fromDataTransfer(
      drop([dirEntry('site', [fileEntry('page.html', '<!doctype html>')])]),
    );
    expect(assets[0]!.kind).toBe('html');
    expect(assets[0]!.mime).toBe('text/html');
  });

  it('keeps asking the reader until it comes back empty', async () => {
    // 250 files across three readEntries calls. A loop that reads once returns
    // 100 files and silently loses 150 of them.
    const many = Array.from({ length: 250 }, (_, i) => fileEntry(`f${i}.css`, 'a{}'));
    const assets = await fromDataTransfer(drop([dirEntry('bulk', many)]));
    expect(assets).toHaveLength(250);
  });

  it('skips the folders nobody wants optimized', async () => {
    const assets = await fromDataTransfer(
      drop([
        dirEntry('site', [
          fileEntry('keep.css', 'a{}'),
          dirEntry('node_modules', [fileEntry('dep.js', 'x')]),
          dirEntry('dist', [fileEntry('old.js', 'x')]),
          dirEntry('.git', [fileEntry('config', 'x')]),
          dirEntry('vendor', [fileEntry('lib.js', 'x')]),
        ]),
      ]),
    );
    expect(paths(assets)).toEqual(['site/keep.css']);
  });

  it('skips dot-directories but not dot-files', async () => {
    const assets = await fromDataTransfer(
      drop([
        dirEntry('site', [
          fileEntry('.htaccess', 'deny'),
          dirEntry('.cache', [fileEntry('x.css', 'a{}')]),
        ]),
      ]),
    );
    expect(paths(assets)).toEqual(['site/.htaccess']);
  });

  it('accepts several dropped roots at once', async () => {
    const assets = await fromDataTransfer(
      drop([
        dirEntry('one', [fileEntry('a.css', 'a{}')]),
        fileEntry('loose.css', 'b{}'),
      ]),
    );
    expect(paths(assets)).toEqual(['loose.css', 'one/a.css']);
  });

  it('falls back to the plain file list when a drop carries no entries', async () => {
    // Safari and older browsers hand over files without the entries API.
    const assets = await fromDataTransfer(
      plainDrop([new File(['a{}'], 'site.css'), new File(['<p>'], 'page.html')]),
    );
    expect(paths(assets)).toEqual(['page.html', 'site.css']);
  });

  it('does not choke on an empty drop', async () => {
    expect(await fromDataTransfer(plainDrop([]))).toEqual([]);
  });

  it('stops at the file cap rather than trying to read a whole disk', async () => {
    const many = Array.from({ length: 5200 }, (_, i) => fileEntry(`f${i}.css`, 'a{}'));
    const assets = await fromDataTransfer(drop([dirEntry('huge', many)]));
    expect(assets.length).toBeLessThanOrEqual(5000);
    expect(assets.length).toBeGreaterThan(4000);
  });
});

describe('fromFileList', () => {
  it('prefers the relative path a directory pick provides', async () => {
    const file = new File(['a{}'], 'site.css');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'assets/css/site.css' });
    const assets = await fromFileList([file]);
    expect(assets[0]!.path).toBe('assets/css/site.css');
  });

  it('falls back to the bare name when there is no relative path', async () => {
    const assets = await fromFileList([new File(['a{}'], 'site.css')]);
    expect(assets[0]!.path).toBe('site.css');
  });

  it('reads the bytes, not just the name', async () => {
    const assets = await fromFileList([new File(['.a{color:red}'], 'site.css')]);
    expect(new TextDecoder().decode(assets[0]!.bytes)).toBe('.a{color:red}');
  });
});

describe('fromDataTransfer resilience', () => {
  /** An entry that looks readable and then refuses, as WebKit's does. */
  function refusingFile(name: string): Entry {
    return {
      isFile: true,
      isDirectory: false,
      name,
      file: (_ok: (f: File) => void, fail: (e: Error) => void) =>
        fail(new Error('NotFoundError: Path does not exist')),
    } as unknown as Entry;
  }

  it('keeps the files it can read when one entry refuses', async () => {
    const assets = await fromDataTransfer(
      drop([
        dirEntry('site', [
          fileEntry('good.css', 'a{}'),
          refusingFile('bad.css'),
          fileEntry('also-good.css', 'b{}'),
        ]),
      ]),
    );
    expect(paths(assets)).toEqual(['site/also-good.css', 'site/good.css']);
  });

  it('falls back to the plain file list when every entry refuses', async () => {
    // This is the WebKit case exactly: the entries API is present and answers,
    // then every read fails. Before the fallback, the drop did nothing at all.
    const files = [new File(['a{}'], 'site.css'), new File(['<p>'], 'index.html')];
    const transfer = {
      items: [{ kind: 'file', webkitGetAsEntry: () => refusingFile('site.css') }],
      files,
    } as unknown as DataTransfer;

    const assets = await fromDataTransfer(transfer);
    expect(paths(assets)).toEqual(['index.html', 'site.css']);
  });

  it('never throws, whatever the entry does', async () => {
    const exploding = {
      isFile: false,
      isDirectory: true,
      name: 'boom',
      createReader: () => ({
        readEntries: (_ok: unknown, fail: (e: Error) => void) => fail(new Error('nope')),
      }),
    } as unknown as Entry;

    await expect(fromDataTransfer(drop([exploding], []))).resolves.toEqual([]);
  });
});
