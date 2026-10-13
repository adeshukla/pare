import { describe, expect, it } from 'vitest';
import { addDimensions } from '../../src/lib/picture-wrap';

describe('addDimensions (ADR-037)', () => {
  const sizes = new Map([['img/a.jpg', { width: 900, height: 600 }]]);
  const exists = (p: string) => p === 'img/a.jpg';

  it('adds both attributes before the tag closes, leaving the rest as written', () => {
    const html = '<p><img  src="img/a.jpg" alt="A"><img src="img/a.jpg"/></p>';
    const out = addDimensions(html, 'index.html', sizes, exists);
    expect(out.added).toBe(2);
    expect(out.text).toBe(
      '<p><img  src="img/a.jpg" alt="A" width="900" height="600"><img src="img/a.jpg" width="900" height="600" /></p>',
    );
  });

  it('leaves tags that have either attribute, or show another image', () => {
    const html = '<img src="img/a.jpg" width="10"><img src="img/b.jpg"><img src="../img/a.jpg">';
    const out = addDimensions(html, 'blog/post.html', sizes, exists);
    // Only the third resolves to img/a.jpg from blog/, and it has neither attribute.
    expect(out.added).toBe(1);
    expect(out.text).toBe('<img src="img/a.jpg" width="10"><img src="img/b.jpg"><img src="../img/a.jpg" width="900" height="600">');
  });
});
