import { describe, expect, it } from 'vitest';
import { writeTree, type DirectoryLike } from '../../src/lib/save-folder';

/** An in-memory folder shaped like a FileSystemDirectoryHandle. */
function fakeDir(existing: string[] = []) {
  const written = new Map<string, Uint8Array>();
  const make = (prefix: string, names: string[]): DirectoryLike => ({
    async *keys() {
      yield* names;
    },
    async getDirectoryHandle(name) {
      return make(prefix + name + '/', []);
    },
    async getFileHandle(name) {
      return {
        async createWritable() {
          let data = new Uint8Array();
          return {
            async write(d: BufferSource) {
              data = new Uint8Array(d as ArrayBuffer);
            },
            async close() {
              written.set(prefix + name, data);
            },
          };
        },
      };
    },
  });
  return { dir: make('', existing), written };
}

describe('writeTree', () => {
  it('writes nested paths into an empty folder', async () => {
    const { dir, written } = fakeDir();
    const progress: number[] = [];
    const result = await writeTree(
      dir,
      { 'a.txt': new Uint8Array([1]), 'img/b.avif': new Uint8Array([2, 3]), 'img/deep/c.webp': new Uint8Array([4]) },
      (done) => progress.push(done),
    );
    expect(result).toEqual({ written: 3 });
    expect([...written.keys()].sort()).toEqual(['a.txt', 'img/b.avif', 'img/deep/c.webp']);
    expect([...written.get('img/b.avif')!]).toEqual([2, 3]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('refuses a folder that already holds anything, and writes nothing', async () => {
    const { dir, written } = fakeDir(['index.html']);
    const result = await writeTree(dir, { 'index.html': new Uint8Array([1]) });
    expect(result).toHaveProperty('refused');
    expect(written.size).toBe(0);
  });
});
