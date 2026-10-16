import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ADR-040: the policy allows the one inline script by its hash. Edit the
 * script by so much as a space and the hash changes - and the browser would
 * quietly refuse to run it. This catches that before a deploy does.
 */
describe('Content-Security-Policy', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const policy = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';

  it('allows every inline script in index.html by its hash', () => {
    const html = readFileSync('index.html', 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = createHash('sha256').update(script).digest('base64');
      expect(policy).toContain(`'sha256-${hash}'`);
    }
  });

  it('allows nothing from another origin', () => {
    expect(policy).toMatch(/default-src 'self'/);
    expect(policy).not.toMatch(/https?:|\*/);
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
