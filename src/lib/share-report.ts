import { bytes, reduction } from './format';

/**
 * A before-and-after page to hand to someone else (audit item 12) - an agency
 * to its client, a developer to a manager. One self-contained HTML file: no
 * scripts, no network, opens anywhere. Same numbers as the screen (Law 5):
 * "after" is what a visitor downloads.
 */
export type ReportEntry = { name: string; before: number; after: number; note?: string };

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function savingsReport(entries: ReportEntry[], scope: string, when = new Date()): string {
  const before = entries.reduce((n, e) => n + e.before, 0);
  const after = entries.reduce((n, e) => n + e.after, 0);
  const cut = reduction(before, after);
  const date = when.toISOString().slice(0, 10);

  const rows = entries
    .map((e) => {
      const c = reduction(e.before, e.after);
      return `<tr><td>${escape(e.name)}${e.note ? `<small>${escape(e.note)}</small>` : ''}</td><td>${bytes(e.before)}</td><td>${bytes(e.after)}</td><td>${c > 0 ? `${c}% smaller` : 'no change'}</td></tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Savings report — ${escape(scope)} — ${date}</title>
<style>
:root { color-scheme: light dark; --ink: #18181b; --muted: #63636b; --rule: #e4e4e7; --paper: #fff; --saved: #047857; }
@media (prefers-color-scheme: dark) { :root { --ink: #f4f4f5; --muted: #a1a1aa; --rule: #27272a; --paper: #09090b; --saved: #34d399; } }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 40px 16px; }
h1 { font-size: 28px; margin: 0 0 4px; }
.lede { color: var(--muted); margin: 0 0 28px; }
.big { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.big span { color: var(--muted); }
.cut { color: var(--saved); }
table { width: 100%; border-collapse: collapse; margin-top: 28px; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 8px 0 8px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th:first-child, td:first-child { text-align: left; padding-left: 0; word-break: break-all; }
th { color: var(--muted); font-weight: 500; font-size: 13px; }
td small { display: block; color: var(--muted); }
footer { color: var(--muted); font-size: 13px; margin-top: 28px; }
</style>
</head>
<body>
<main>
<h1>Savings report</h1>
<p class="lede">${escape(scope)} · ${entries.length} file${entries.length === 1 ? '' : 's'} · ${date}</p>
<p class="big"><span>${bytes(before)} →</span> ${bytes(after)}${cut > 0 ? ` <span class="cut">${cut}% smaller</span>` : ''}</p>
<table>
<thead><tr><th>File</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<footer>"After" is what a visitor downloads: for an image offered in several formats, the smallest one a browser picks. Percentages are rounded down. Made with Pare, in the browser - no file was uploaded.</footer>
</main>
</body>
</html>
`;
}
