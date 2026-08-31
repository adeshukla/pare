import { useRef, useState } from 'react';
import { canPickDirectory, fromDataTransfer, fromFileList, pickDirectory } from '../lib/ingest';
import type { Asset } from '../lib/types';

export function DropZone({ onAssets }: { onAssets: (assets: Asset[]) => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(fn: () => Promise<Asset[]>) {
    setBusy(true);
    try {
      onAssets(await fn());
    } catch (e) {
      // User cancelled the picker. Not an error worth surfacing.
      if ((e as DOMException)?.name !== 'AbortError') throw e;
    } finally {
      setBusy(false);
      setOver(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        void load(() => fromDataTransfer(e.dataTransfer));
      }}
      className={`border border-dashed p-12 text-center transition-colors ${
        over ? 'border-ink bg-white' : 'border-rule'
      }`}
    >
      <p className="text-lg">
        {busy ? 'Reading files…' : 'Drop a folder or files here'}
      </p>
      <p className="mt-2 text-sm text-muted">
        Nothing is uploaded. Everything runs in this browser tab.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {canPickDirectory() && (
          <button
            onClick={() => void load(pickDirectory)}
            className="border border-ink px-4 py-2 text-sm hover:bg-ink hover:text-paper"
          >
            Choose a folder
          </button>
        )}
        <button
          onClick={() => input.current?.click()}
          className="border border-rule px-4 py-2 text-sm hover:border-ink"
        >
          Choose files
        </button>
      </div>

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => e.target.files && void load(() => fromFileList(e.target.files!))}
      />
    </div>
  );
}
