/**
 * Saving output straight into a folder, where the browser allows it (Chromium's
 * File System Access API). Everywhere else the zip download is the path, and it
 * stays the path here too - this only saves an unzip step.
 *
 * Law 4 decides the one rule: originals are never modified in place. So the
 * folder must be EMPTY. Pare cannot tell a folder the user just made from the
 * one their site lives in, and "never overwrite anything" is a rule a user can
 * hold in their head. ADR-024.
 */

export const canSaveToFolder = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** The subset of FileSystemDirectoryHandle this file uses, so tests can fake it. */
export type DirectoryLike = {
  keys(): AsyncIterable<string>;
  getDirectoryHandle(name: string, options: { create: true }): Promise<DirectoryLike>;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<{ createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }> }>;
};

export type SaveResult = { written: number } | { refused: string };

/**
 * Write every file under `dir`, creating subfolders as needed. Refuses a folder
 * that already holds anything.
 */
export async function writeTree(
  dir: DirectoryLike,
  files: Record<string, Uint8Array>,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<SaveResult> {
  for await (const name of dir.keys()) {
    void name;
    return {
      refused:
        'That folder already has files in it. Pare never overwrites anything, so choose or create an empty folder.',
    };
  }

  const folders = new Map<string, DirectoryLike>([['', dir]]);
  const folderFor = async (path: string): Promise<DirectoryLike> => {
    const known = folders.get(path);
    if (known) return known;
    const slash = path.lastIndexOf('/');
    const parent = await folderFor(slash === -1 ? '' : path.slice(0, slash));
    const made = await parent.getDirectoryHandle(path.slice(slash + 1), { create: true });
    folders.set(path, made);
    return made;
  };

  const entries = Object.entries(files);
  let done = 0;
  for (const [path, bytes] of entries) {
    const slash = path.lastIndexOf('/');
    const parent = await folderFor(slash === -1 ? '' : path.slice(0, slash));
    const handle = await parent.getFileHandle(path.slice(slash + 1), { create: true });
    const out = await handle.createWritable();
    await out.write(bytes as BufferSource);
    await out.close();
    onProgress(++done, entries.length);
  }
  return { written: done };
}

/** Ask for a folder, then write into it. Throws AbortError if the user cancels. */
export async function saveToFolder(
  files: Record<string, Uint8Array>,
  onProgress?: (done: number, total: number) => void,
): Promise<SaveResult> {
  const picker = (window as unknown as {
    showDirectoryPicker(options: { mode: 'readwrite'; id: string; startIn: string }): Promise<DirectoryLike>;
  }).showDirectoryPicker;
  const dir = await picker.call(window, { mode: 'readwrite', id: 'pare-output', startIn: 'downloads' });
  return writeTree(dir, files, onProgress);
}
