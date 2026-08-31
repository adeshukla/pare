import { useCallback, useMemo, useState } from 'react';
import { Controls } from './components/Controls';
import { DropZone } from './components/DropZone';
import { Results } from './components/Results';
import { buildZip, download } from './lib/emit';
import { bytes, reduction } from './lib/format';
import { newRow, optimizeAssets, summarise, type Row } from './lib/optimize';
import { poolSize } from './lib/pool';
import { DEFAULTS, type ImageSettings } from './lib/settings';
import type { Asset } from './lib/types';

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<ImageSettings>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [note, setNote] = useState('');

  const imageCount = rows.filter((r) => r.asset.kind === 'image').length;
  const report = useMemo(() => summarise(rows), [rows]);

  const accept = useCallback((assets: Asset[]) => {
    if (assets.length === 0) {
      setNote('Nothing readable in that drop.');
      return;
    }
    setNote('');
    setRan(false);
    setRows(assets.map(newRow));
  }, []);

  async function optimize() {
    setRunning(true);
    setNote('');
    // Patch rows in place as workers report in, so progress is visible per file.
    const update = (index: number, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

    try {
      const done = await optimizeAssets(
        rows.map((r) => r.asset),
        settings,
        update,
      );
      setRows(done);
      setRan(true);
    } finally {
      setRunning(false);
    }
  }

  const cut = reduction(report.bytesBefore, report.bytesServed);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl">Pare</h1>
        <p className="mt-2 max-w-prose text-muted">
          Shrink your images and get the markup to use them. Files are read in this
          tab and never sent anywhere &mdash; there is no server to send them to.
        </p>
      </header>

      <DropZone onAssets={accept} />

      {note && <p className="mt-6 text-sm text-warn">{note}</p>}

      {rows.length > 0 && (
        <>
          <Controls settings={settings} onChange={setSettings} disabled={running} />

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={() => void optimize()}
              disabled={running || imageCount === 0}
              className="border border-ink px-5 py-2 text-sm hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
            >
              {running
                ? 'Working…'
                : 'Optimize ' + imageCount + (imageCount === 1 ? ' image' : ' images')}
            </button>
            <span className="text-xs text-muted">
              {rows.length} files &middot; {poolSize} worker{poolSize === 1 ? '' : 's'}
              {rows.length > imageCount &&
                ' · ' + (rows.length - imageCount) + ' non-image files copied unchanged'}
            </span>
          </div>

          {ran && (
            <section className="mt-10 border border-rule p-5" aria-label="Savings">
              <p className="text-2xl">
                <span className="tnum">{bytes(report.bytesBefore)}</span>
                <span className="text-muted"> &rarr; </span>
                <span className="tnum">{bytes(report.bytesServed)}</span>
                {cut > 0 && <span className="text-saved"> &middot; {cut}% smaller</span>}
              </p>
              <p className="mt-2 max-w-prose text-sm text-muted">
                Measured at full size, using the smallest format each browser can
                read. Smaller screens fetch a smaller file again. The download holds{' '}
                <span className="tnum">{bytes(report.bytesEmitted)}</span> across every
                width and format &mdash; a visitor only ever downloads one of them.
              </p>
              {report.skipped > 0 && (
                <p className="mt-2 text-sm text-warn">
                  {report.skipped} file{report.skipped === 1 ? ' was' : 's were'} left
                  unchanged. The reason is on the row.
                </p>
              )}
              {report.metadataRemoved > 0 && (
                <p className="mt-2 text-sm text-muted">
                  <span className="tnum">{bytes(report.metadataRemoved)}</span> of camera
                  metadata removed from files kept in their original form.
                </p>
              )}

              <button
                onClick={() => download(buildZip(rows), 'pare-output.zip')}
                className="mt-5 border border-ink px-5 py-2 text-sm hover:bg-ink hover:text-paper"
              >
                Download zip
              </button>
              <p className="mt-3 text-xs text-muted">
                Includes <code className="font-mono">snippets.html</code> with every
                generated tag. Your original files are untouched.
              </p>
            </section>
          )}

          <Results rows={rows} />
        </>
      )}
    </main>
  );
}
