import { classify } from './classify';
import type { Asset } from './types';

/**
 * Two input paths, both shipped. AGENTS.md: never gate a core feature behind a
 * Chromium-only API.
 *
 *   1. showDirectoryPicker()  — Chromium. Real folder handle, can write back.
 *   2. webkitGetAsEntry()     — everywhere. Drag-drop a folder, read only.
 *
 * Plain <input type="file" multiple> covers the "just some files" case.
 */

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor']);
export const MAX_FILES = 5000;

export const canPickDirectory = () => 'showDirectoryPicker' in window;

async function toAsset(file: File, path: string): Promise<Asset> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { kind, mime } = classify(path, bytes);
  // Phase 0: no graph yet, so nothing has references and nothing is renamed.
  return { path, bytes, kind, mime, refs: [], resolvable: false };
}

export async function fromFileList(files: FileList | File[]): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const file of Array.from(files).slice(0, MAX_FILES)) {
    out.push(await toAsset(file, file.webkitRelativePath || file.name));
  }
  return out;
}

/** Chromium path. Throws AbortError if the user cancels — callers should ignore that. */
export async function pickDirectory(): Promise<Asset[]> {
  // @ts-expect-error showDirectoryPicker is not in lib.dom yet
  const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker();
  const out: Asset[] = [];

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    // @ts-expect-error async iterator on directory handles is not in lib.dom yet
    for await (const [name, entry] of dir.entries()) {
      if (out.length >= MAX_FILES) return;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
        await walk(entry as FileSystemDirectoryHandle, path);
      } else {
        const file = await (entry as FileSystemFileHandle).getFile();
        out.push(await toAsset(file, path));
      }
    }
  }

  await walk(handle, '');
  return out;
}

/** Universal path. Reads a dropped folder via the legacy entries API. */
export async function fromDataTransfer(dt: DataTransfer): Promise<Asset[]> {
  const roots = Array.from(dt.items)
    .map((i) => (i.kind === 'file' ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);

  if (roots.length === 0) return fromFileList(dt.files);

  const out: Asset[] = [];

  const readDir = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((res, rej) => reader.readEntries(res, rej));

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isFile) {
      try {
        const file = await new Promise<File>((res, rej) =>
          (entry as FileSystemFileEntry).file(res, rej),
        );
        out.push(await toAsset(file, path));
      } catch {
        // One entry the browser will not hand over must not take the whole drop
        // with it. WebKit does exactly this: webkitGetAsEntry returns an entry
        // that looks fine and then rejects the read with NotFoundError, and
        // before this catch existed the drop silently did nothing at all.
      }
      return;
    }

    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) return;

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most 100 at a time; keep calling until empty.
    for (;;) {
      const batch = await readDir(reader);
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, path);
    }
  }

  for (const root of roots) {
    try {
      await walk(root, '');
    } catch {
      // Same reasoning one level up: a directory that cannot be enumerated
      // costs its own contents, not the entire drop.
    }
  }

  // The entries API was there but produced nothing usable. The plain file list
  // is still perfectly good, and it is what the user actually dropped.
  return out.length > 0 ? out : fromFileList(dt.files);
}
