import { useState } from 'react';
import { zipSync } from 'fflate';
import { DropZone } from './components/DropZone';
import { poolSize, runAll } from './lib/pool';
import { bytes, reduction } from './lib/format';
import type { Asset } from './lib/types';
import type { Inspection } from './workers/inspect.worker';

type Row = { asset: Asset; info: Inspection };

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');

  async function handle(assets: Asset[]) {
    if (assets.length === 0) {
      setStatus('No readable files in that drop.');
      return;
    }
    setStatus(`Inspecting ${assets.length} files across ${poolSize} workers…`);

    const infos = await runAll(assets, (asset, api) =>
      api.inspect(asset.bytes, asset.mime, asset.kind, () => {}),
    );

    setRows(assets.map((asset, i) => ({ asset, info: infos[i]! })));
    setStatus('');
  }

  function download() {
    const files: Record<string, Uint8Array> = {};
    for (const { asset } of rows) files[asset.path] = asset.bytes;
    const blob = new Blob([zipSync(files) as BufferSource], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pare-output.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  const raw = rows.reduce((n, r) => n + r.info.rawBytes, 0);
  const gz = rows.reduce((n, r) => n + r.info.gzipBytes, 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl">Pare</h1>
        <p className="mt-2 max-w-prose text-muted">
          Compress and convert your site&rsquo;s assets without installing anything.
          Files are read in this tab and never sent anywhere.
        </p>
      </header>

      <DropZone onAssets={handle} />

      {status && <p className="mt-6 text-sm text-muted">{status}</p>}

      {rows.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-rule pb-3">
            <h2>
              {rows.length} files ·{' '}
              <span className="tnum">{bytes(raw)}</span>
            </h2>
            <p className="text-sm text-muted">
              <span className="tnum">{bytes(gz)}</span> gzipped ·{' '}
              <span className="text-saved tnum">{reduction(raw, gz)}% smaller</span>
            </p>
          </div>

          <table className="mt-4 w-full text-sm">
            <tbody>
              {rows.map(({ asset, info }) => (
                <tr key={asset.path} className="border-b border-rule/60">
                  <td className="py-2 pr-4 font-mono text-xs">{asset.path}</td>
                  <td className="py-2 pr-4 text-muted">{asset.kind}</td>
                  <td className="py-2 pr-4 text-muted tnum">
                    {info.width ? `${info.width}×${info.height}` : ''}
                  </td>
                  <td className="py-2 text-right tnum">{bytes(info.rawBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={download}
            className="mt-8 border border-ink px-4 py-2 text-sm hover:bg-ink hover:text-paper"
          >
            Download as zip
          </button>
          <p className="mt-3 text-xs text-muted">
            Phase 0: files are passed through unchanged. Optimizers land in Phase 1.
          </p>
        </section>
      )}
    </main>
  );
}
