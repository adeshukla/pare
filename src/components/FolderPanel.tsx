import { bytes, reduction } from '../lib/format';
import type { FolderResult, FolderSettings } from '../lib/folder';
import type { VerifyReport } from '../lib/verify';
import { VIEWPORTS } from '../lib/verify';

/**
 * Folder mode's controls, its warning list, and the verification gate.
 *
 * The gate is the point of the whole screen. Phase 4 is the first thing Pare does
 * that can break a page, and `docs/ROADMAP.md` says it does not ship without a
 * verifier. So the download button is not rendered until the check has run and
 * come back clean - there is no "download anyway".
 */

const check = 'flex items-center gap-2 text-sm';

export function FolderControls({
  settings,
  onChange,
  disabled,
}: {
  settings: FolderSettings;
  onChange: (next: FolderSettings) => void;
  disabled: boolean;
}) {
  const patch = (p: Partial<FolderSettings>) => onChange({ ...settings, ...p });

  return (
    <section className="mt-8 border border-rule" aria-label="Whole site">
      <h2 className="border-b border-rule px-5 py-3 text-sm tracking-wide text-muted uppercase">
        Whole site
      </h2>
      <fieldset disabled={disabled} className="grid gap-3 p-5">
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.images}
            onChange={(e) => patch({ images: e.target.checked })}
          />
          Re-compress images, keeping their format
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.text}
            onChange={(e) => patch({ text: e.target.checked })}
          />
          Minify CSS, JavaScript, HTML and SVG
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.hash}
            onChange={(e) => patch({ hash: e.target.checked })}
          />
          Add a content fingerprint to filenames, so browsers can cache them forever
        </label>
      </fieldset>
      <p className="border-t border-rule px-5 py-3 text-xs text-muted">
        Your markup is not restructured — only addresses change, and only where
        every reference to a file could be traced. Anything Pare could not follow
        keeps its name and is listed below.
      </p>
    </section>
  );
}

export function VerificationReport({
  report,
  onDisableHashing,
}: {
  report: VerifyReport;
  onDisableHashing: () => void;
}) {
  if (report.unavailable) {
    return (
      <section className="mt-8 border border-warn/40 p-5" aria-label="Verification">
        <p className="text-sm text-warn">
          The before-and-after check could not run in this browser ({report.unavailable}),
          so the download is not offered. Nothing was changed on your computer.
        </p>
      </section>
    );
  }

  if (report.passed) {
    return (
      <section className="mt-8 border border-rule p-5" aria-label="Verification">
        <p className="text-sm">
          <span className="text-saved">Checked.</span> {report.pagesChecked} page
          {report.pagesChecked === 1 ? '' : 's'} rendered before and after at{' '}
          {VIEWPORTS.join(', ')}px — every element is in the same place and every
          image and stylesheet still loads.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-warn p-5" aria-label="Verification">
      <h3 className="text-sm text-warn">
        Something moved. The download is not being offered.
      </h3>
      <ul className="mt-3 space-y-1 text-sm text-muted">
        {report.findings.slice(0, 12).map((finding, i) => (
          <li key={i}>
            <span className="font-mono text-xs">{finding.page}</span> at{' '}
            <span className="tnum">{finding.viewport}px</span> — {finding.message}
          </li>
        ))}
      </ul>
      {report.findings.length > 12 && (
        <p className="mt-2 text-xs text-muted">
          and {report.findings.length - 12} more.
        </p>
      )}
      <p className="mt-4 max-w-prose text-sm text-muted">
        Renaming files for caching is the only step here that can change what a page
        points at. Turning it off leaves every filename exactly as it was, and the
        files still get smaller.
      </p>
      <button
        onClick={onDisableHashing}
        className="mt-4 border border-ink px-4 py-2 text-sm hover:bg-ink hover:text-paper"
      >
        Turn off renaming and check again
      </button>
    </section>
  );
}

export function FolderSummary({ result }: { result: FolderResult }) {
  const before = result.files.reduce((n, f) => n + f.bytesBefore, 0);
  const after = result.files.reduce((n, f) => n + f.bytes.byteLength, 0);
  const cut = reduction(before, after);

  return (
    <section className="mt-8 border border-rule p-5" aria-label="Site savings">
      <p className="text-2xl">
        <span className="tnum">{bytes(before)}</span>
        <span className="text-muted"> &rarr; </span>
        <span className="tnum">{bytes(after)}</span>
        {cut > 0 && <span className="text-saved"> &middot; {cut}% smaller</span>}
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {result.files.length} files &middot; {result.renamed.size} fingerprinted
        &middot; {result.rewritten} address{result.rewritten === 1 ? '' : 'es'} updated.
        This is the whole folder, so it is a straight before-and-after: every file
        here replaces the one it came from.
      </p>
    </section>
  );
}

export function FolderWarnings({ result }: { result: FolderResult }) {
  if (result.warnings.length === 0) return null;

  return (
    <details className="mt-8 border border-rule">
      <summary className="cursor-pointer px-5 py-3 text-sm tracking-wide text-muted uppercase">
        Left alone ({result.warnings.length})
      </summary>
      <ul className="space-y-2 border-t border-rule px-5 py-4 text-sm">
        {result.warnings.map((warning, i) => (
          <li key={i}>
            <span className="font-mono text-xs break-all">{warning.path}</span>
            <span className="block text-muted">{warning.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
