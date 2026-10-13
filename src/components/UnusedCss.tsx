import { useState } from 'react';
import { bytes } from '../lib/format';
import type { UnusedSheet, VirtualFile } from '../lib/verify';
import { findUnusedCss } from '../lib/verify';
import { Icon } from './Visuals';

/**
 * ADR-031: CSS that matched nothing on any page, as a list for the site's
 * author to read. Pare never removes CSS (ADR-002) - only a person knows
 * whether `.cart-error` is dead or just waiting for an empty cart.
 */
export function UnusedCss({ files, pages }: { files: VirtualFile[]; pages: string[] }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [sheets, setSheets] = useState<UnusedSheet[]>([]);
  const [copied, setCopied] = useState(false);

  async function run() {
    setState('running');
    setSheets(await findUnusedCss(files, pages));
    setState('done');
  }

  async function copy() {
    const text = sheets
      .map((s) => `/* ${s.source} - ${s.rules.length} rules, ${bytes(s.unusedBytes)} */\n` + s.rules.map((r) => r.selector).join('\n'))
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const total = sheets.reduce((n, s) => n + s.unusedBytes, 0);
  const count = sheets.reduce((n, s) => n + s.rules.length, 0);

  return (
    <section className="card rise mt-4 overflow-hidden" aria-label="Possibly unused CSS">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="max-w-prose">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="code" size={16} className="text-accent" />
            Possibly unused CSS
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            A list for you to check, never something Pare removes. A rule that matched nothing here
            may still be used by a script, by content your server adds, by a page not in this folder,
            or by a state nobody opened — a full cart, a form error, a logged-in menu.
          </p>
        </div>
        {state !== 'done' && (
          <button onClick={() => void run()} disabled={state === 'running'} className="btn">
            {state === 'running' ? (
              <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
            ) : (
              <Icon name="sparkle" size={15} />
            )}
            {state === 'running' ? 'Checking every page…' : 'Find possibly unused CSS'}
          </button>
        )}
      </div>

      {state === 'done' && (
        <div className="border-t border-rule px-5 py-4">
          {sheets.length === 0 ? (
            <p className="text-sm">Every rule matched something on at least one page.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="tnum font-semibold">{count}</span> rule{count === 1 ? '' : 's'} matched
                  nothing, <span className="tnum font-semibold">{bytes(total)}</span> before minifying.
                </p>
                <button onClick={() => void copy()} className="btn btn-sm">
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? 'Copied' : 'Copy the list'}
                </button>
              </div>
              <div className="mt-3 grid gap-3">
                {sheets.map((sheet) => (
                  <details key={sheet.source} className="well group overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-mono text-xs">{sheet.source}</span>
                      <span className="tnum flex-none text-xs text-muted">
                        {sheet.rules.length} rules · {bytes(sheet.unusedBytes)}
                        {sheet.totalBytes > 0 && ` of ${bytes(sheet.totalBytes)}`}
                      </span>
                    </summary>
                    <ul className="max-h-72 overflow-auto border-t border-rule px-4 py-2 font-mono text-xs">
                      {sheet.rules.map((rule) => (
                        <li key={rule.selector} className="flex justify-between gap-4 py-0.5">
                          <span className="min-w-0 break-all">{rule.selector}</span>
                          <span className="tnum flex-none text-muted">{bytes(rule.bytes)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
