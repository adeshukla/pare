import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canPickDirectory, fromDataTransfer, fromFileList, MAX_FILES, pickDirectory } from '../lib/ingest';
import { expandZips } from '../lib/unzip';
import type { Asset } from '../lib/types';
import { Icon } from './Visuals';

/**
 * Where files come in. The whole window accepts a drop - aiming at a box is a
 * chore once the page has scrolled past it - and a pasted image (a screenshot,
 * say) is taken too, unless the paste is going into a text field.
 */
export function DropZone({
  onAssets,
  compact,
}: {
  onAssets: (assets: Asset[], notes: string[]) => void;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const handler = useRef(onAssets);
  useEffect(() => {
    handler.current = onAssets;
  }, [onAssets]);

  async function load(fn: () => Promise<Asset[]>) {
    setBusy(true);
    try {
      // A zip anywhere in the drop is opened in place (ADR-029).
      const { assets, notes } = await expandZips(await fn(), MAX_FILES);
      handler.current(assets, notes);
    } catch (e) {
      // User cancelled the picker. Not an error worth surfacing.
      if ((e as DOMException)?.name !== 'AbortError') throw e;
    } finally {
      setBusy(false);
      setOver(false);
    }
  }

  // Layout effect, not effect: attached before the drop zone is first painted,
  // so there is no moment where the zone is visible and a drop goes nowhere.
  useLayoutEffect(() => {
    // dragenter/dragleave fire for every child crossed; count them so the
    // overlay does not flicker off while the pointer moves over the page.
    let depth = 0;
    const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer || !carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      const dt = e.dataTransfer;
      void load(() => fromDataTransfer(dt));
    };
    const paste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      // Copied now: clipboard data is emptied once the event returns.
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      void load(() => fromFileList(files));
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);

  const buttons = (
    <div className={`flex flex-wrap justify-center gap-2.5 ${compact ? '' : 'mt-7'}`}>
      {canPickDirectory() && (
        <button
          onClick={() => void load(pickDirectory)}
          className={`btn btn-primary ${compact ? 'btn-sm' : 'btn-lg'}`}
        >
          <Icon name="folder" size={compact ? 15 : 18} />
          Choose a folder
        </button>
      )}
      <button
        onClick={() => input.current?.click()}
        className={`btn ${compact ? 'btn-sm' : 'btn-lg'} ${canPickDirectory() ? '' : 'btn-primary'}`}
      >
        <Icon name="upload" size={compact ? 15 : 18} />
        Choose files
      </button>
    </div>
  );

  return (
    <>
      {over && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-paper/70 backdrop-blur-md"
        >
          <div className="pop flex flex-col items-center gap-4">
            <span className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-2xl shadow-accent/40">
              <span className="float-tile inline-flex">
                <Icon name="upload" size={34} />
              </span>
            </span>
            <p className="text-xl font-semibold">Drop to add these files</p>
            <p className="text-sm text-muted">They stay in this tab.</p>
          </div>
        </div>
      )}

      {compact ? (
        <div className="drop-zone flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-over={over}>
          <p className="flex items-center gap-3 text-sm text-muted">
            <Icon name="upload" size={16} />
            {busy ? 'Reading files…' : 'Drop, paste or choose more files to start again'}
          </p>
          {buttons}
        </div>
      ) : (
        <div className="drop-zone rise px-6 py-12 text-center sm:py-16" data-over={over} style={{ ['--i' as string]: 1 }}>
          <div aria-hidden="true" className="relative mx-auto mb-6 h-20 w-44">
            {[
              ['JPG', '-left-1 top-6', '-6deg', 'linear-gradient(135deg,#f59e0b,#ef4444)'],
              ['WOFF2', 'right-0 top-1', '5deg', 'linear-gradient(135deg,#06b6d4,#3b82f6)'],
              ['CSS', 'left-7 -top-2', '3deg', 'linear-gradient(135deg,#8b5cf6,#6366f1)'],
              ['SVG', 'right-6 top-11', '-4deg', 'linear-gradient(135deg,#10b981,#14b8a6)'],
            ].map(([label, at, r, bg], i) => (
              <span
                key={label}
                className={`float-tile badge absolute h-7 min-w-0 px-2 text-[9px] shadow-md ${at}`}
                style={{ background: bg, ['--i' as string]: i, ['--r' as string]: r }}
              >
                {label}
              </span>
            ))}
            <span className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-xl shadow-accent/30">
              <Icon name="upload" size={26} />
            </span>
          </div>
          <p className="text-xl font-semibold tracking-tight">
            {busy ? 'Reading files…' : 'Drop a folder or files here'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Or a .zip, or paste an image. Nothing is uploaded — everything runs in this browser tab.
          </p>
          {buttons}
        </div>
      )}

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          // Copied before the reset below, which empties the live FileList.
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void load(() => fromFileList(files));
          // Choosing the same file again should still fire a change.
          e.target.value = '';
        }}
      />
    </>
  );
}
