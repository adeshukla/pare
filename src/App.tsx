import { useCallback, useMemo, useState } from 'react';
import { Controls, type Present } from './components/Controls';
import { DropZone } from './components/DropZone';
import { Results } from './components/Results';
import { buildZip, download } from './lib/emit';
import { bytes, reduction } from './lib/format';
import {
  isTextKind,
  newRow,
  optimizeAssets,
  REPORT_LABEL,
  summarise,
  type Row,
  type Settings,
} from './lib/optimize';
import { poolSize } from './lib/pool';
import { DEFAULTS, FONT_DEFAULTS, TEXT_DEFAULTS } from './lib/settings';
import type { Asset } from './lib/types';

const INITIAL: Settings = { image: DEFAULTS, font: FONT_DEFAULTS, text: TEXT_DEFAULTS };

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings>(INITIAL);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [note, setNote] = useState('');

  const present: Present = useMemo(
    () => ({
      image: rows.some((r) => r.asset.kind === 'image'),
      font: rows.some((r) => r.asset.kind === 'font'),
      text: rows.some((r) => isTextKind(r.asset.kind)),
    }),
    [rows],
  );

  const workable = rows.filter(
    (r) => r.asset.kind === 'image' || r.asset.kind === 'font' || isTextKind(r.asset.kind),
  ).length;

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
          Shrink your images, fonts and code, and get the markup to use them. Files
          are read in this tab and never sent anywhere &mdash; there is no server to
          send them to.
        </p>
      </header>

      <DropZone onAssets={accept} />

      {note && <p className="mt-6 text-sm text-warn">{note}</p>}

      {rows.length > 0 && (
        <>
          <Controls
            settings={settings}
            onChange={setSettings}
            disabled={running}
            present={present}
          />

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={() => void optimize()}
              disabled={running || workable === 0}
              className="border border-ink px-5 py-2 text-sm hover:bg-ink hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
            >
              {running
                ? 'Working…'
                : 'Optimize ' + workable + (workable === 1 ? ' file' : ' files')}
            </button>
            <span className="text-xs text-muted">
              {rows.length} dropped &middot; {poolSize} worker{poolSize === 1 ? '' : 's'}
              {rows.length > workable &&
                ' · ' + (rows.length - workable) + ' copied unchanged'}
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
                What a visitor downloads: for images the smallest full-size format
                their browser reads, for split fonts the first file only, for code
                the smallest compressed copy. The zip holds{' '}
                <span className="tnum">{bytes(report.bytesEmitted)}</span> across every
                variant &mdash; nobody downloads all of it.
              </p>

              {report.lines.length > 1 && (
                <table className="mt-5 w-full max-w-md text-sm">
                  <tbody>
                    {report.lines.map((line) => (
                      <tr key={line.kind} className="border-t border-rule/60">
                        <td className="py-1.5 pr-4 text-muted">{REPORT_LABEL[line.kind]}</td>
                        <td className="tnum py-1.5 pr-4 text-right text-muted">
                          {line.count}
                        </td>
                        <td className="tnum py-1.5 pr-4 text-right">{bytes(line.before)}</td>
                        <td className="tnum py-1.5 pr-4 text-right">{bytes(line.served)}</td>
                        <td className="tnum py-1.5 text-right">
                          {reduction(line.before, line.served) > 0 ? (
                            <span className="text-saved">
                              {reduction(line.before, line.served)}%
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {report.skipped > 0 && (
                <p className="mt-4 text-sm text-warn">
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
