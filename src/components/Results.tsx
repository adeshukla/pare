import { useState, type ReactNode } from 'react';
import { bytes, reduction } from '../lib/format';
import { servedVariant, type Row } from '../lib/optimize';
import { Compare } from './Compare';
import { FORMAT_LABEL } from '../lib/settings';
import { FileThumb, Icon } from './Visuals';

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

/**
 * Light colouring for HTML and CSS snippets. Spans only: the text inside the
 * <pre> is exactly the snippet, character for character, so what is copied and
 * what is read are the same.
 */
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  const token = /(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/)|(<\/?[a-zA-Z][\w-]*|\/?>)|([\w-:@]+)(?==)|("[^"]*")|(@[\w-]+)/g;
  let last = 0;
  let key = 0;
  for (const m of code.matchAll(token)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [text, comment, tag, attr, string, at] = m;
    const cls = comment
      ? 'text-muted italic'
      : tag
        ? 'text-accent'
        : attr
          ? 'text-accent-2'
          : string
            ? 'text-saved'
            : at
              ? 'text-accent'
              : '';
    out.push(
      <span key={key++} className={cls}>
        {text}
      </span>,
    );
    last = m.index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="well relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <button onClick={() => void copy()} className="btn btn-sm">
          <span key={String(copied)} className="pop inline-flex">
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}

/** Full-width output per format beside the original, as bars. */
function FormatBars({ row }: { row: Row }) {
  const outcome = row.outcome;
  if (!outcome || outcome.skipped) return null;
  const full = outcome.variants.filter((v) => v.width === outcome.naturalWidth);
  if (full.length === 0) return null;
  const items = [
    { label: 'Original', bytes: outcome.bytesBefore, original: true },
    ...full.map((v) => ({
      label: v.format === 'fallback' ? 'Re-encoded' : FORMAT_LABEL[v.format],
      bytes: v.bytes.byteLength,
      original: false,
    })),
  ];
  const max = Math.max(...items.map((i) => i.bytes));
  return (
    <div className="grid gap-2" aria-label="Size of each format at full width">
      {items.map((item, i) => (
        <div key={item.label} className="grid grid-cols-[84px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
          <span className="text-muted">{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-rule">
            <i
              className="block h-full origin-left rounded-full"
              style={{
                width: `${Math.max(1.5, (item.bytes / max) * 100)}%`,
                background: item.original
                  ? 'var(--color-muted)'
                  : 'linear-gradient(90deg, var(--color-saved), color-mix(in srgb, var(--color-saved) 60%, var(--color-accent)))',
                animation: `grow-x 0.9s var(--ease-out-expo) ${i * 0.08}s both`,
              }}
            />
          </span>
          <span className="tnum text-right">{bytes(item.bytes)}</span>
        </div>
      ))}
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
  // Until the run finishes nothing has been copied anywhere yet; saying so early
  // would describe an outcome that has not happened.
  return { before: raw, after: undefined, detail: row.state === 'done' ? 'copied unchanged' : '' };
}

function FileRow({ row, index }: { row: Row; index: number }) {
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

  const status = row.state === 'queued' ? 'waiting' : row.state === 'running' ? row.label : detail;

  return (
    <>
      <tr
        className={`rise border-b border-rule transition-colors hover:bg-[color-mix(in_srgb,var(--color-raised)_70%,transparent)] ${open ? 'bg-raised/60' : ''}`}
        style={{ ['--i' as string]: Math.min(index, 12) }}
      >
        <td className="py-3 pr-3 pl-3">
          <div className="flex min-w-0 items-center gap-3">
            <FileThumb asset={row.asset} />
            <div className="min-w-0">
              {row.snippet ? (
                <button
                  onClick={() => setOpen(!open)}
                  className="group flex max-w-full items-center gap-1.5 text-left font-mono text-[13px] font-medium break-all hover:text-accent"
                  aria-expanded={open}
                >
                  {row.asset.path}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`flex-none text-muted transition-transform duration-300 group-hover:text-accent ${open ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              ) : (
                <span className="block font-mono text-[13px] font-medium break-all">{row.asset.path}</span>
              )}
              <span className="mt-0.5 block truncate text-xs text-muted">{status}</span>
            </div>
          </div>
        </td>
        <td className="tnum py-3 pr-3 text-right text-muted">{bytes(before)}</td>
        <td className="tnum py-3 pr-3 text-right font-medium">
          {row.state === 'done' ? (after === undefined ? '—' : bytes(after)) : ''}
        </td>
        <td className="py-3 pr-3 text-right">
          {row.state === 'running' && (
            <span className="progress ml-auto block w-full max-w-24" role="progressbar" aria-label={row.asset.path + ' progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.progress * 100)}>
              <i style={{ width: `${Math.max(4, row.progress * 100)}%` }} />
            </span>
          )}
          {row.state === 'queued' && <span className="ml-auto block h-1.5 w-full max-w-24 rounded-full bg-rule" />}
          {row.state === 'done' && cut > 0 && <span className="pill-saved pop">{cut}% smaller</span>}
          {row.state === 'done' && cut === 0 && <span className="text-xs text-muted">no change</span>}
        </td>
      </tr>

      {skipped && (
        <tr className="border-b border-rule">
          <td colSpan={4} className="px-3 pb-3 text-xs text-warn">
            {skipped}
          </td>
        </tr>
      )}

      {warnings.length > 0 && (
        <tr className="border-b border-rule">
          <td colSpan={4} className="px-3 pb-3 text-xs text-warn">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </td>
        </tr>
      )}

      {open && row.snippet && (
        <tr className="border-b border-rule bg-raised/60">
          <td colSpan={4} className="rise px-3 pt-1 pb-5">
            <div className="grid gap-5">
              {row.outcome && !row.outcome.skipped && (
                <>
                  <FormatBars row={row} />
                  <Compare original={row.asset.bytes} mime={row.asset.mime} outcome={row.outcome} />
                </>
              )}
              <Snippet code={row.snippet} />
              {emitted !== undefined && (
                <p className="-mt-2 text-xs text-muted">
                  {(row.outcome?.variants.length ?? row.font?.slices.length ?? 0)} files emitted,{' '}
                  {bytes(emitted)} in total. A visitor downloads one of them.
                  {row.outcome?.placeholder &&
                    ' The inline placeholder adds ' +
                      bytes(row.outcome.placeholder.length) +
                      ' to your HTML.'}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function Results({ rows }: { rows: Row[] }) {
  return (
    <div className="card mt-4 overflow-hidden">
      {/* Fixed layout: an auto table sizes columns to their longest unbreakable
          content, and one expanded snippet (a ThumbHash data URI is a single
          long line) once stretched this table to 31,000px. */}
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-muted">
            <th className="py-2.5 pr-3 pl-3 font-medium">File</th>
            <th className="w-[17%] py-2.5 pr-3 text-right font-medium">Before</th>
            <th className="w-[17%] py-2.5 pr-3 text-right font-medium">After</th>
            <th className="w-[22%] py-2.5 pr-3 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <FileRow key={row.asset.path} row={row} index={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
