import { describe, expect, it } from 'vitest';
import { encodeCssValue, findCssRefs } from '../../src/lib/css-refs';
import {
  applyEdits,
  decodeEntities,
  encodeAttrValue,
  scanAttributes,
  scanRawText,
} from '../../src/lib/html-scan';
import {
  classifyRef,
  formatSrcset,
  looksTemplated,
  parseSrcset,
  resolveAgainst,
} from '../../src/lib/url-ref';

const exists = (...paths: string[]) => {
  const set = new Set(paths);
  return (p: string) => set.has(p);
};

describe('resolveAgainst', () => {
  it('resolves relative to the file holding the reference', () => {
    expect(resolveAgainst('index.html', 'img/hero.jpg')).toBe('img/hero.jpg');
    expect(resolveAgainst('css/site.css', '../img/hero.jpg')).toBe('img/hero.jpg');
    expect(resolveAgainst('a/b/c.html', './d.png')).toBe('a/b/d.png');
  });

  it('treats a root-relative path as relative to the dropped folder', () => {
    expect(resolveAgainst('deep/page.html', '/img/hero.jpg')).toBe('img/hero.jpg');
  });

  it('refuses to climb above the folder it was given', () => {
    // ../../secrets is not ours to rewrite, and may not even exist.
    expect(resolveAgainst('index.html', '../outside.png')).toBeUndefined();
    expect(resolveAgainst('a/b.html', '../../outside.png')).toBeUndefined();
  });
});

describe('looksTemplated', () => {
  it('spots server and client templating', () => {
    expect(looksTemplated('<?php echo $x; ?>/a.jpg')).toBe('PHP');
    expect(looksTemplated('{{ asset }}')).toBe('a template placeholder');
    expect(looksTemplated('{% static "a.jpg" %}')).toBe('a template tag');
    expect(looksTemplated('<%= path %>')).toBe('a template tag');
    expect(looksTemplated('${base}/a.jpg')).toBe('a JavaScript template literal');
    expect(looksTemplated('$IMAGE_PATH')).toBe('a variable');
  });

  it('leaves an ordinary path alone', () => {
    expect(looksTemplated('img/hero-800.jpg')).toBeUndefined();
    expect(looksTemplated('a/b_c-d.2x.png')).toBeUndefined();
  });
});

describe('classifyRef', () => {
  const has = exists('img/hero.jpg', 'css/site.css');

  it('resolves an internal reference that points at a real file', () => {
    expect(classifyRef('img/hero.jpg', 'index.html', has)).toEqual({
      kind: 'internal',
      target: 'img/hero.jpg',
      resolvable: true,
    });
  });

  it('keeps a query string or fragment out of the resolved path', () => {
    const result = classifyRef('img/hero.jpg?v=2', 'index.html', has);
    expect(result.resolvable).toBe(true);
    expect(result.target).toBe('img/hero.jpg');
  });

  it('refuses anything that leaves the folder', () => {
    for (const raw of [
      'https://cdn.example.com/a.jpg',
      '//cdn.example.com/a.jpg',
      'http://example.com/a.jpg',
    ]) {
      expect(classifyRef(raw, 'index.html', has)).toMatchObject({
        kind: 'external',
        resolvable: false,
      });
    }
  });

  it('refuses data, blob and the non-http schemes', () => {
    expect(classifyRef('data:image/png;base64,AAA', 'i.html', has).kind).toBe('inline');
    expect(classifyRef('mailto:a@b.com', 'i.html', has).kind).toBe('special');
    expect(classifyRef('javascript:void(0)', 'i.html', has).kind).toBe('special');
    expect(classifyRef('#main', 'i.html', has).kind).toBe('anchor');
  });

  it('refuses a templated address and says which template it saw', () => {
    const result = classifyRef('{{ url }}/a.jpg', 'index.html', has);
    expect(result.resolvable).toBe(false);
    expect(result.reason).toContain('template placeholder');
  });

  it('refuses a path that names a file we were not given', () => {
    const result = classifyRef('img/missing.jpg', 'index.html', has);
    expect(result.resolvable).toBe(false);
    expect(result.reason).toContain('no file named img/missing.jpg');
  });

  it('is not fooled by an empty or whitespace-only reference', () => {
    expect(classifyRef('', 'i.html', has).resolvable).toBe(false);
    expect(classifyRef('   ', 'i.html', has).resolvable).toBe(false);
  });
});

describe('parseSrcset', () => {
  it('splits candidates and keeps their descriptors', () => {
    expect(parseSrcset('a-400.jpg 400w, a-800.jpg 800w')).toEqual([
      { url: 'a-400.jpg', descriptor: '400w' },
      { url: 'a-800.jpg', descriptor: '800w' },
    ]);
  });

  it('handles a single candidate with no descriptor', () => {
    expect(parseSrcset('a.jpg')).toEqual([{ url: 'a.jpg', descriptor: '' }]);
  });

  it('does not split a URL that contains a comma', () => {
    // Legal per the HTML spec, as long as the URL does not end with one.
    const parsed = parseSrcset('img/a,b.jpg 400w, img/c.jpg 800w');
    expect(parsed).toEqual([
      { url: 'img/a,b.jpg', descriptor: '400w' },
      { url: 'img/c.jpg', descriptor: '800w' },
    ]);
  });

  it('reads a candidate whose descriptor was omitted before a comma', () => {
    expect(parseSrcset('a.jpg, b.jpg 2x')).toEqual([
      { url: 'a.jpg', descriptor: '' },
      { url: 'b.jpg', descriptor: '2x' },
    ]);
  });

  it('tolerates stray whitespace and repeated commas', () => {
    expect(parseSrcset('  a.jpg 1x ,,  b.jpg 2x  ')).toHaveLength(2);
    expect(parseSrcset('')).toEqual([]);
  });

  it('round-trips through formatSrcset', () => {
    const value = 'a-400.jpg 400w, a-800.jpg 800w';
    expect(formatSrcset(parseSrcset(value))).toBe(value);
  });
});

describe('scanAttributes', () => {
  it('finds attribute values with their exact byte range', () => {
    const html = '<img src="a.jpg" alt="x">';
    const hit = scanAttributes(html).find((a) => a.attr === 'src')!;
    expect(hit.value).toBe('a.jpg');
    expect(html.slice(hit.start, hit.end)).toBe('a.jpg');
    expect(hit.quote).toBe('"');
    expect(hit.tag).toBe('img');
  });

  it('handles single quotes and unquoted values', () => {
    const html = "<img src='a.jpg'><img src=b.jpg>";
    const hits = scanAttributes(html).filter((a) => a.attr === 'src');
    expect(hits.map((h) => h.value)).toEqual(['a.jpg', 'b.jpg']);
    expect(hits[1]!.quote).toBe('');
  });

  it('lowercases tag and attribute names but not values', () => {
    const hit = scanAttributes('<IMG SRC="A.JPG">')[0]!;
    expect(hit.tag).toBe('img');
    expect(hit.attr).toBe('src');
    expect(hit.value).toBe('A.JPG');
  });

  it('ignores anything inside a comment', () => {
    const hits = scanAttributes('<!-- <img src="ghost.jpg"> --><img src="real.jpg">');
    expect(hits.map((h) => h.value)).toEqual(['real.jpg']);
  });

  it('does not read tags inside a script or style body', () => {
    const html = '<script>var s = "<img src=\'ghost.jpg\'>";</script><img src="real.jpg">';
    const hits = scanAttributes(html).filter((h) => h.attr === 'src');
    expect(hits.map((h) => h.value)).toEqual(['real.jpg']);
  });

  it('survives a valueless attribute and a self-closing tag', () => {
    const hits = scanAttributes('<input disabled required name="a" /><img src="b.jpg"/>');
    expect(hits.find((h) => h.attr === 'name')?.value).toBe('a');
    expect(hits.find((h) => h.attr === 'src')?.value).toBe('b.jpg');
  });

  it('does not hang on an unterminated tag or quote', () => {
    expect(() => scanAttributes('<img src="unterminated')).not.toThrow();
    expect(() => scanAttributes('<img ')).not.toThrow();
    expect(() => scanAttributes('<<<>>>')).not.toThrow();
  });
});

describe('scanRawText', () => {
  it('captures style and script bodies with their range', () => {
    const html = '<style>.a{color:red}</style><script>var x=1;</script>';
    const raw = scanRawText(html);
    expect(raw.map((r) => r.tag)).toEqual(['style', 'script']);
    expect(raw[0]!.text).toBe('.a{color:red}');
    expect(html.slice(raw[1]!.start, raw[1]!.end)).toBe('var x=1;');
  });

  it('exposes the opening tag attributes', () => {
    const raw = scanRawText('<script type="module">a</script>')[0]!;
    expect(raw.attrs.type).toBe('module');
  });

  it('reports an empty body for an external script', () => {
    const raw = scanRawText('<script src="a.js"></script>')[0]!;
    expect(raw.text).toBe('');
    expect(raw.attrs.src).toBe('a.js');
  });
});

describe('entities', () => {
  it('decodes what an attribute value can realistically hold', () => {
    expect(decodeEntities('a&amp;b')).toBe('a&b');
    expect(decodeEntities('a&#38;b')).toBe('a&b');
    expect(decodeEntities('&quot;x&quot;')).toBe('"x"');
    expect(decodeEntities('plain')).toBe('plain');
  });

  it('leaves an unknown entity exactly as it found it', () => {
    expect(decodeEntities('&nosuchthing;')).toBe('&nosuchthing;');
  });

  it('round-trips through the encoder for each quoting style', () => {
    const value = 'a&b"c\'d';
    expect(decodeEntities(encodeAttrValue(value, '"'))).toBe(value);
    expect(decodeEntities(encodeAttrValue(value, "'"))).toBe(value);
  });
});

describe('applyEdits', () => {
  it('applies several edits without disturbing the offsets of the others', () => {
    const source = '<img src="a.jpg"><img src="b.jpg">';
    const hits = scanAttributes(source).filter((h) => h.attr === 'src');
    const out = applyEdits(
      source,
      hits.map((h) => ({ start: h.start, end: h.end, text: h.value.replace('.jpg', '.avif') })),
    );
    expect(out).toBe('<img src="a.avif"><img src="b.avif">');
  });

  it('changes nothing outside the ranges it was given', () => {
    const source = 'keep <b>this</b> [HERE] and this';
    const at = source.indexOf('[HERE]');
    expect(applyEdits(source, [{ start: at, end: at + 6, text: 'X' }])).toBe(
      'keep <b>this</b> X and this',
    );
  });

  it('drops an overlapping edit rather than corrupting the file', () => {
    const source = 'abcdefgh';
    const out = applyEdits(source, [
      { start: 0, end: 4, text: 'X' },
      { start: 2, end: 6, text: 'Y' },
    ]);
    expect(out === 'Xefgh' || out === 'abYgh').toBe(true);
  });
});

describe('findCssRefs', () => {
  it('finds quoted and bare url() addresses', () => {
    const css = '.a{background:url("img/a.png")}.b{background:url(img/b.png)}';
    const refs = findCssRefs(css);
    expect(refs.map((r) => r.value)).toEqual(['img/a.png', 'img/b.png']);
    for (const ref of refs) expect(css.slice(ref.start, ref.end)).toBe(ref.value);
  });

  it('finds @import in both spellings', () => {
    const refs = findCssRefs('@import "a.css";\n@import url("b.css");');
    expect(refs.map((r) => r.value)).toEqual(['a.css', 'b.css']);
    expect(refs[0]!.source).toBe('import');
    expect(refs[1]!.source).toBe('url');
  });

  it('is not fooled by url( inside a comment or a string', () => {
    const css = '/* url(ghost.png) */ .a{content:"url(ghost2.png)";background:url(real.png)}';
    expect(findCssRefs(css).map((r) => r.value)).toEqual(['real.png']);
  });

  it('trims whitespace inside a bare url()', () => {
    expect(findCssRefs('.a{background:url(  sp.png  )}')[0]!.value).toBe('sp.png');
  });

  it('ignores an empty url()', () => {
    expect(findCssRefs('.a{background:url()}')).toEqual([]);
  });

  it('does not hang on unterminated input', () => {
    expect(() => findCssRefs('.a{background:url("unterminated')).not.toThrow();
    expect(() => findCssRefs('/* unterminated comment')).not.toThrow();
  });

  it('rewrites cleanly through applyEdits', () => {
    const css = '.a{background:url("img/a.png")}';
    const ref = findCssRefs(css)[0]!;
    const out = applyEdits(css, [
      { start: ref.start, end: ref.end, text: encodeCssValue('img/a.h4sh.png', ref.quote) },
    ]);
    expect(out).toBe('.a{background:url("img/a.h4sh.png")}');
  });
});
