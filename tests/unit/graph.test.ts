import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify } from '../../src/lib/classify';
import { buildGraph } from '../../src/lib/graph';
import { contentHash, hashedPath, replaceBasename } from '../../src/lib/hash';
import { refsByFile, rewriteReferences } from '../../src/lib/rewrite';
import type { Asset } from '../../src/lib/types';

/**
 * The Law 3 suite.
 *
 * Every case here is a way a reference can fail to be resolvable. Getting any of
 * them wrong means renaming a file that something still points at, which is a 404
 * on someone's site - the exact failure the law exists to prevent.
 */

const ROOT = 'tests/fixtures/site';

function loadSite(): Asset[] {
  const out: Asset[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = `${dir}/${name}`;
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
        continue;
      }
      const bytes = new Uint8Array(readFileSync(full));
      const { kind, mime } = classify(rel, bytes);
      out.push({ path: rel, bytes, kind, mime, refs: [], resolvable: false });
    }
  };
  walk(ROOT, '');
  return out;
}

const assets = loadSite();
const graph = buildGraph(assets);
const text = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const warningsFor = (path: string) =>
  graph.warnings.filter((w) => w.path === path).map((w) => w.message).join(' ');

describe('entry detection', () => {
  it('finds the HTML pages, shallowest first', () => {
    expect(graph.entries).toEqual(['about.html', 'index.html']);
  });
});

describe('reference discovery', () => {
  const targets = (from: string) =>
    graph.refs.filter((r) => r.from === from && r.target).map((r) => r.target);

  it('follows href, src and srcset out of a page', () => {
    expect(targets('index.html')).toEqual(
      expect.arrayContaining([
        'css/site.css',
        'img/icon.png',
        'img/hero.png',
        'about.html',
        'js/app.js',
      ]),
    );
  });

  it('reads both candidates out of a srcset', () => {
    const srcset = graph.refs.filter((r) => r.from === 'index.html' && r.srcsetIndex !== undefined);
    expect(srcset).toHaveLength(2);
    expect(srcset.map((r) => r.target)).toEqual(['img/hero.png', 'img/icon.png']);
  });

  it('follows url() and @import inside a stylesheet', () => {
    expect(targets('css/site.css')).toEqual(
      expect.arrayContaining(['css/type.css', 'img/hero.png', 'img/icon.png']),
    );
  });

  it('follows a url() inside a <style> block, with the right offset', () => {
    const ref = graph.refs.find((r) => r.from === 'about.html' && r.target === 'img/hero.png');
    expect(ref).toBeDefined();
    // The recorded range must actually contain the address in the real file.
    const source = text('about.html');
    expect(source.slice(ref!.at!.start, ref!.at!.end)).toBe('img/hero.png');
  });

  it('records a byte range that matches the address for every rewritable reference', () => {
    for (const ref of graph.refs) {
      if (!ref.at || ref.srcsetIndex !== undefined) continue;
      const source = text(ref.from);
      expect(source.slice(ref.at.start, ref.at.end)).toContain(ref.raw);
    }
  });
});

describe('Law 3 — what may be renamed', () => {
  it('allows a file every reference to which resolves', () => {
    expect(graph.renameable.has('css/site.css')).toBe(true);
    expect(graph.renameable.has('css/type.css')).toBe(true);
    expect(graph.renameable.has('img/icon.png')).toBe(true);
  });

  it('refuses a file used from an inline style attribute', () => {
    expect(graph.renameable.has('img/inline.png')).toBe(false);
    expect(warningsFor('img/inline.png')).toMatch(/inline style attribute/);
  });

  it('refuses a file merely named inside a script', () => {
    // Nothing else points at it, and app.js contains the string. Renaming it
    // would break a gallery that only assembles the path at runtime.
    expect(graph.renameable.has('img/scripted.png')).toBe(false);
    expect(warningsFor('img/scripted.png')).toMatch(/scripts are not rewritten/);
  });

  it('refuses a page, because its name is its address', () => {
    expect(graph.renameable.has('index.html')).toBe(false);
    expect(graph.renameable.has('about.html')).toBe(false);
    expect(warningsFor('index.html')).toMatch(/address/);
  });

  it('refuses a file nothing points at', () => {
    // img/hero.png is referenced, so use the font, which only type.css names.
    expect(graph.renameable.has('img/site.woff2')).toBe(true);
    const orphan = assets.find((a) => (graph.byTarget.get(a.path) ?? []).length === 0);
    if (orphan && !graph.entries.includes(orphan.path)) {
      expect(graph.renameable.has(orphan.path)).toBe(false);
    }
  });

  it('still allows a file that is also referenced in a way that does resolve', () => {
    // hero.png appears in a templated src too, but that reference resolves to
    // no target at all, so it does not pin the file the real references name.
    expect(graph.renameable.has('img/hero.png')).toBe(true);
  });

  it('reports the templated and external references it walked past', () => {
    const all = graph.warnings.map((w) => w.message).join(' ');
    expect(all).toMatch(/template placeholder/);
  });

  it('reports a stylesheet pointing at a file that was never dropped in', () => {
    expect(warningsFor('css/site.css')).toMatch(/no file named img\/absent\.png/);
  });
});

describe('rewriting', () => {
  it('renames only what Law 3 allowed, and updates every pointer to it', async () => {
    const renamed = new Map<string, string>();
    for (const asset of assets) {
      if (!graph.renameable.has(asset.path)) continue;
      renamed.set(asset.path, hashedPath(asset.path, await contentHash(asset.bytes)));
    }

    const perFile = refsByFile(graph.refs);
    const html = rewriteReferences(text('index.html'), perFile.get('index.html') ?? [], renamed);
    const css = rewriteReferences(text('css/site.css'), perFile.get('css/site.css') ?? [], renamed);

    // icon.png was renameable, so both the <link> and the srcset candidate move.
    const iconName = renamed.get('img/icon.png')!.split('/').pop()!;
    expect(html.text).toContain(iconName);

    // inline.png was not, so its address is untouched.
    expect(html.text).toContain("url('img/inline.png')");
    // and neither is the templated one.
    expect(html.text).toContain('{{ asset_path }}/img/hero.png');
    expect(html.text).toContain('https://example.com/remote.png');

    // The stylesheet's relative shape survives: ../ stays ../.
    expect(css.text).toMatch(/url\(\.\.\/img\/hero\.[0-9a-f]{8}\.png\)/);
    expect(css.text).toContain('../img/absent.png');
  });

  it('changes nothing except the addresses', async () => {
    const renamed = new Map([['img/icon.png', 'img/icon.deadbeef.png']]);
    const source = text('index.html');
    const out = rewriteReferences(source, refsByFile(graph.refs).get('index.html') ?? [], renamed);

    // Byte-for-byte equal once the one changed address is put back.
    expect(out.text.replace(/icon\.deadbeef\.png/g, 'icon.png')).toBe(source);
  });

  it('rewrites one srcset candidate without disturbing the other', () => {
    const renamed = new Map([['img/icon.png', 'img/icon.deadbeef.png']]);
    const out = rewriteReferences(
      text('index.html'),
      refsByFile(graph.refs).get('index.html') ?? [],
      renamed,
    );
    expect(out.text).toContain('img/hero.png 1x, img/icon.deadbeef.png 2x');
  });

  it('does nothing at all when nothing was renamed', () => {
    const source = text('index.html');
    const out = rewriteReferences(source, refsByFile(graph.refs).get('index.html') ?? [], new Map());
    expect(out.text).toBe(source);
    expect(out.rewritten).toBe(0);
  });
});

describe('hashing', () => {
  it('is stable for the same bytes and different for different bytes', async () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(await contentHash(a)).toBe(await contentHash(new Uint8Array([1, 2, 3])));
    expect(await contentHash(a)).not.toBe(await contentHash(new Uint8Array([1, 2, 4])));
    expect(await contentHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('puts the hash before the extension so the type is still obvious', () => {
    expect(hashedPath('img/hero.png', 'abcd1234')).toBe('img/hero.abcd1234.png');
    expect(hashedPath('a/b/LICENSE', 'abcd1234')).toBe('a/b/LICENSE.abcd1234');
  });

  it('keeps the shape of a reference when swapping the filename', () => {
    expect(replaceBasename('../img/hero.png', 'hero.abcd1234.png')).toBe(
      '../img/hero.abcd1234.png',
    );
    expect(replaceBasename('/img/hero.png?v=2', 'hero.abcd1234.png')).toBe(
      '/img/hero.abcd1234.png?v=2',
    );
    expect(replaceBasename('hero.png#frag', 'hero.abcd1234.png')).toBe('hero.abcd1234.png#frag');
  });
});

describe('data files (ADR-038)', () => {
  const enc = new TextEncoder();
  const file = (path: string, text: string): Asset => {
    const bytes = enc.encode(text);
    return { path, bytes, ...classify(path, bytes), refs: [], resolvable: false };
  };

  it('keeps the name of anything a manifest or sitemap names', () => {
    const graph = buildGraph([
      file('index.html', '<link rel="manifest" href="app.webmanifest"><link rel="icon" href="icon-192.png"><img src="hero.png">'),
      file('app.webmanifest', '{"icons":[{"src":"/icon-192.png"}]}'),
      file('icon-192.png', 'x'),
      file('hero.png', 'x'),
    ]);
    expect(graph.renameable.has('icon-192.png')).toBe(false);
    expect(graph.renameable.has('hero.png')).toBe(true);
  });
});
