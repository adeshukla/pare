import { describe, expect, it } from 'vitest';
import { CodecUnavailable, loadOnce } from '../../src/workers/once';

describe('loadOnce', () => {
  it('remembers a codec that loaded, and loads it only once', async () => {
    let calls = 0;
    const load = loadOnce('x', async () => ++calls);
    expect(await load()).toBe(1);
    expect(await load()).toBe(1);
    expect(calls).toBe(1);
  });

  it('forgets a failed start, so the next call tries again, and says the codec failed', async () => {
    let calls = 0;
    const load = loadOnce('esbuild', async () => {
      if (++calls === 1) throw new RangeError('Out of memory');
      return 'ready';
    });
    const first = await load().catch((e: unknown) => e);
    expect(first).toBeInstanceOf(CodecUnavailable);
    expect((first as Error).message).toBe('esbuild could not start: Out of memory');
    expect(await load()).toBe('ready');
    expect(calls).toBe(2);
  });
});
