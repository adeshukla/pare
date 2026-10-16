import { describe, expect, it } from 'vitest';
import { minifyJson, minifyXml } from '../../src/lib/data-minify';

describe('minifyJson (ADR-038)', () => {
  it('removes whitespace outside strings and nothing else', () => {
    const src = '{\n  "name": "a  b",\n  "n": 1.0,\n  "big": 12345678901234567890,\n  "esc": "q\\" x"\n}\n';
    expect(minifyJson(src)).toBe('{"name":"a  b","n":1.0,"big":12345678901234567890,"esc":"q\\" x"}');
  });
  it('leaves a file that is not JSON alone', () => {
    expect(minifyJson('{ "a": 1, }')).toBeUndefined();
  });
});

describe('minifyXml (ADR-038)', () => {
  it('drops indentation between tags, keeps comments, CDATA and values', () => {
    const src =
      '<?xml version="1.0"?>\n<urlset>\n  <!-- home -->\n  <url>\n    <loc>https://a.example/ x</loc>\n    <note><![CDATA[ < > ]]></note>\n    <empty>\n    </empty>\n  </url>\n</urlset>\n';
    const out = minifyXml(src);
    expect(out).toEqual({
      code: '<?xml version="1.0"?><urlset><!-- home --><url><loc>https://a.example/ x</loc><note><![CDATA[ < > ]]></note><empty>\n    </empty></url></urlset>',
    });
  });
  it('keeps spaces with no line break, and > inside attribute values', () => {
    const src = '<a t="x > y"> <b/> </a>';
    expect(minifyXml(src)).toEqual({ code: src });
  });
  it('refuses xml:space="preserve", XHTML and broken files', () => {
    expect(minifyXml('<a xml:space="preserve">\n</a>')).toHaveProperty('skipped');
    expect(minifyXml('<html xmlns="http://www.w3.org/1999/xhtml">\n<p/></html>')).toHaveProperty('skipped');
    expect(minifyXml('<a><!-- open')).toHaveProperty('skipped');
  });
});
