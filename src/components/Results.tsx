import { useState } from 'react';
import { bytes, reduction } from '../lib/format';
import { servedVariant, type Row } from '../lib/optimize';

/**
 * The report. Law 5 shapes every number on this screen:
 *
 *   - "After" is the single file a browser downloads at full width, not the sum
 *     of every variant we emitted. Summing them would understate the win; showing
 *     only the smallest thumbnail would overstate it.
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

function FileRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const outcome = row.outcome;
  const served = outcome ? servedVariant(outcome) : undefined;
  const after = outcome?.skipped ? outcome.bytesBefore : served?.bytes.byteLength;
  const before = outcome?.bytesBefore ?? row.inspection?.rawBytes ?? row.asset.bytes.byteLength;
  const cut = after === undefined ? 0 : reduction(before, after);

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

        <td className="tnum py-2 pr-4 text-xs text-muted">
          {outcome && outcome.naturalWidth > 0
            ? outcome.naturalWidth + '×' + outcome.naturalHeight
            : row.inspection?.width
              ? row.inspection.width + '×' + row.inspection.height
              : ''}
        </td>

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

      {outcome?.skipped && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-3 text-xs text-warn">
            {outcome.skipped}
          </td>
        </tr>
      )}

      {outcome && outcome.warnings.length > 0 && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-3 text-xs text-warn">
            {outcome.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </td>
        </tr>
      )}

      {open && row.snippet && (
        <tr className="border-b border-rule/60">
          <td colSpan={5} className="pb-4">
            <Snippet code={row.snippet} />
            {outcome && (
              <p className="mt-2 text-xs text-muted">
                {outcome.variants.length} files emitted, {bytes(
                  outcome.variants.reduce((n, v) => n + v.bytes.byteLength, 0),
                )}{' '}
                in total. A visitor downloads one of them.
                {outcome.placeholder &&
                  ' The inline placeholder adds ' +
                    bytes(outcome.placeholder.length) +
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
          <th className="py-2 pr-4 text-left font-normal">Size</th>
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
