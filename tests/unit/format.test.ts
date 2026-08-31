import { describe, expect, it } from 'vitest';
import { bytes, reduction } from '../../src/lib/format';

describe('bytes', () => {
  it('switches units at the right thresholds', () => {
    expect(bytes(0)).toBe('0 B');
    expect(bytes(1023)).toBe('1023 B');
    expect(bytes(1024)).toBe('1.0 KB');
    expect(bytes(1024 * 1024 - 1)).toBe('1024.0 KB');
    expect(bytes(1024 * 1024)).toBe('1.00 MB');
  });
});

describe('reduction', () => {
  // Law 5: never round a saving up. 87.9% is reported as 87%.
  it('rounds down, always', () => {
    expect(reduction(1000, 121)).toBe(87);
    expect(reduction(100, 1)).toBe(99);
    expect(reduction(3, 2)).toBe(33);
  });

  it('reports no saving rather than a negative one', () => {
    expect(reduction(100, 100)).toBe(0);
    expect(reduction(100, 250)).toBe(0);
  });

  it('handles a zero-length input without producing NaN or Infinity', () => {
    expect(reduction(0, 0)).toBe(0);
    expect(reduction(0, 10)).toBe(0);
  });
});
