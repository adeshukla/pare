import { useState } from 'react';
import { bytes, reduction } from '../lib/format';
import { servedVariant, type Row } from '../lib/optimize';

/**
 * The report. Law 5 shapes every number on this screen:
 *
 *   - "After" is what a visitor downloads, not the sum of everything emitted.
 *     For an image that is the smallest full-width variant; for a split font the
 *     first slice; for text the smallest transport encoding. Summing every file
 *     would understate the win, and quoting the smallest thumbnail would invent
 *     one nobody experiences.
 *   - Percentages round down.
 *   - Anything skipped says so, in the same table, in a sentence.
 */

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative bg-white">
      <button
        onClick={() => void copy()}
        className="absolute top-2 right-2 border border-rule bg-paper px-2 py-1 text-xs hover:border-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** before, after, and the one-line detail shown under the file name. */
function measure(row: Row): { before: number; after?: number; detail: string } {
  const image = row.outcome;
  if (image) {
    return {
      before: image.bytesBefore,
      after: image.skipped ? image.bytesBefore : servedVariant(image)?.bytes.byteLength,
      detail: image.naturalWidth > 0 ? image.naturalWidth + '×' + image.naturalHeight : '',
    };
  }

  const font = row.font;
  if (font) {
    const detail = font.skipped
      ? font.container.toUpperCase()
      : font.slices.length > 1
        ? font.slices.length + ' files · ' + font.codepointsAfter + ' characters'
        : font.codepointsAfter + ' of ' + font.codepointsBefore + ' characters';
    return { before: font.bytesBefore, after: font.skipped ? font.bytesBefore : font.bytesServed, detail };
  }

  const text = row.text;
  if (text) {
    const encodings = text.siblings.map((s) => (s.encoding === 'gzip' ? 'gzip' : 'brotli'));
    return {
      before: text.bytesBefore,
      after: text.bytesTransport,
      detail: encodings.length > 0 ? 'minified + ' + encodings.join(' + ') : 'minified',
    };
  }

  const raw = row.inspection?.rawBytes ?? row.asset.bytes.byteLength;
  return { before: raw, after: undefined, detail: 'copied unchanged' };
}

function FileRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const { before, after, detail } = measure(row);
  const cut = after === undefined ? 0 : reduction(before, after);

  const skipped = row.outcome?.skipped ?? row.font?.skipped ?? row.text?.skipped;
  const warnings = [
    ...(row.outcome?.warnings ?? []),
    ...(row.font?.warnings ?? []),
    ...(row.text?.warnings ?? []),
  ];

  const emitted =
    row.outcome?.variants.reduce((n, v) => n + v.bytes.byteLength, 0) ??
    row.font?.slices.reduce((n, s) => n + s.bytes.byteLength, 0);

  return (
    <>
      <tr className="border-b border-rule/60 align-baseline">
        <td className="py-2 pr-4 font-mono text-xs break-all">
          {row.snippet ? (
            <button
              onClick={() => setOpen(!open)}
              className="text-left underline decoration-rule underline-offset-4 hover:decoration-ink"
              aria-expanded={open}
            >
              {row.asset.path}
            </button>
          ) : (
            row.asset.path
          )}
        </td>

        <td className="py-2 pr-4 text-xs text-muted">{detail}</td>
        <td className="tnum py-2 pr-4 text-right">{bytes(before)}</td>
        <td className="tnum py-2 pr-4 text-right">
          {row.state === 'done' ? (after === undefined ? '—' : bytes(after)) : ''}
        </td>
        <td className="tnum py-2 text-right">
          {row.state === 'running' && (
            <span className="text-xs text-muted">
              {row.label} {Math.round(row.progress * 100)}%
            </span>
          )}
          {row.state === 'done' && cut > 0 && <span className="text-saved">{cut}% smaller</span>}
          {row.state === 'done' && cut === 0 && (
            <span className="text-xs text-muted">no change</span>
          )}
        </td>
      </tr>

      {skipped && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-3 text-xs text-warn">
            {skipped}
          </td>
        </tr>
      )}

      {warnings.length > 0 && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-3 text-xs text-warn">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </td>
        </tr>
      )}

      {open && row.snippet && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-4">
            <Snippet code={row.snippet} />
            {emitted !== undefined && (
              <p className="mt-2 text-xs text-muted">
                {(row.outcome?.variants.length ?? row.font?.slices.length ?? 0)} files emitted,{' '}
                {bytes(emitted)} in total. A visitor downloads one of them.
                {row.outcome?.placeholder &&
                  ' The inline placeholder adds ' +
                    bytes(row.outcome.placeholder.length) +
                    ' to your HTML.'}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function Results({ rows }: { rows: Row[] }) {
  return (
    <table className="mt-4 w-full text-sm">
      <thead>
        <tr className="border-b border-rule text-xs tracking-wide text-muted uppercase">
          <th className="py-2 pr-4 text-left font-normal">File</th>
          <th className="py-2 pr-4 text-left font-normal">Detail</th>
          <th className="py-2 pr-4 text-right font-normal">Before</th>
          <th className="py-2 pr-4 text-right font-normal">After</th>
          <th className="py-2 text-right font-normal">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <FileRow key={row.asset.path} row={row} />
        ))}
      </tbody>
    </table>
  );
}
