import type { FolderResult, FolderSettings } from './folder';
import type { Row, Settings } from './optimize';
import type { VerifyReport } from './verify';

/**
 * A plain-text summary for a bug report (audit item 13): the browser, the
 * settings, what kinds of files were dropped and what Pare said about them.
 * Never file contents, and never file names - each is replaced by its position
 * and extension, since a name can be private ("passport-scan.jpg").
 *
 * Copied by the person, pasted by the person. Nothing is sent anywhere: there
 * is no telemetry, and this is how support works without it.
 */
export function diagnostic(input: {
  rows: Row[];
  settings: Settings;
  folderSettings: FolderSettings;
  mode: string;
  folder?: FolderResult;
  verification?: VerifyReport;
}): string {
  const { rows, settings, folderSettings, mode, folder, verification } = input;

  // Longest names first, so "a/b.css" is replaced before "b.css" inside it.
  const names = rows
    .map((r, i) => {
      const ext = r.asset.path.includes('.') ? r.asset.path.slice(r.asset.path.lastIndexOf('.')) : '';
      return [r.asset.path, `file${i + 1}${ext}`] as const;
    })
    .flatMap(([path, alias]) => [[path, alias] as const, [path.slice(path.lastIndexOf('/') + 1), alias] as const])
    .filter(([name]) => name.length > 0)
    .sort((a, b) => b[0].length - a[0].length);
  const anonymise = (text: string) => names.reduce((t, [name, alias]) => t.split(name).join(alias), text);

  const kinds = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.asset.kind} (${r.asset.mime})`;
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }

  const notes: string[] = [];
  rows.forEach((r, i) => {
    const said = [
      r.outcome?.skipped,
      r.font?.skipped,
      r.text?.skipped,
      ...(r.outcome?.warnings ?? []),
      ...(r.font?.warnings ?? []),
      ...(r.text?.warnings ?? []),
    ].filter((s): s is string => Boolean(s));
    for (const s of said) notes.push(`file${i + 1}: ${anonymise(s)}`);
  });
  for (const w of folder?.warnings ?? []) notes.push(anonymise(`${w.path}: ${w.message}`));

  const lines = [
    'Pare diagnostic — no file names or contents',
    `Build: ${__BUILD_ID__}`,
    `Browser: ${navigator.userAgent}`,
    `Language: ${navigator.language} · cores: ${navigator.hardwareConcurrency ?? '?'} · isolated: ${crossOriginIsolated} · offline worker: ${Boolean(navigator.serviceWorker?.controller)}`,
    `Mode: ${mode}`,
    `Files: ${rows.length} — ${[...kinds].map(([k, n]) => `${n} × ${k}`).join(', ') || 'none'}`,
    `States: ${['queued', 'running', 'done'].map((s) => `${rows.filter((r) => r.state === s).length} ${s}`).join(', ')}`,
  ];
  if (verification) {
    lines.push(
      `Verification: ${verification.unavailable ?? (verification.passed ? 'passed' : 'failed')} · ${verification.pagesChecked} pages · ${verification.findings.length} findings`,
    );
  }
  lines.push('', 'Settings:', JSON.stringify(settings), JSON.stringify(folderSettings));
  lines.push('', notes.length > 0 ? 'What Pare said:' : 'What Pare said: nothing', ...notes);
  return lines.join('\n');
}
