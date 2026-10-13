import { describe, expect, it } from 'vitest';
import { savingsReport } from '../../src/lib/share-report';

describe('savingsReport', () => {
  const html = savingsReport(
    [
      { name: 'img/<hero>.jpg', before: 200_000, after: 40_001, note: '1200×800' },
      { name: 'site.css', before: 10_000, after: 10_000 },
    ],
    'Whole site',
    new Date('2026-10-14T00:00:00Z'),
  );

  it('totals before and after, rounding the saving down', () => {
    // 210,000 -> 50,001 is 76.19% smaller; reported as 76%.
    expect(html).toContain('205.1 KB →</span> 48.8 KB <span class="cut">76% smaller</span>');
  });
  it('escapes file names and says when nothing changed', () => {
    expect(html).toContain('img/&lt;hero&gt;.jpg');
    expect(html).not.toContain('<hero>');
    expect(html).toContain('<td>no change</td>');
  });
  it('is one page with no scripts', () => {
    expect(html).not.toMatch(/<script|https?:\/\//);
    expect(html).toContain('Whole site · 2 files · 2026-10-14');
  });
});
