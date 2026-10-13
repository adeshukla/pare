import { bytes, reduction } from '../lib/format';
import type { FolderResult, FolderSettings } from '../lib/folder';
import type { Row } from '../lib/optimize';
import type { VerifyReport } from '../lib/verify';
import { VIEWPORTS } from '../lib/verify';
import { Section, Toggle } from './Controls';
import { Burst, DrawnCheck, FileThumb, Icon, Ticker } from './Visuals';

/**
 * Folder mode's controls, its warning list, and the verification gate.
 *
 * The gate is the point of the whole screen. Phase 4 is the first thing Pare does
 * that can break a page, and `docs/ROADMAP.md` says it does not ship without a
 * verifier. So the download button is not rendered until the check has run and
 * come back clean - there is no "download anyway".
 */

export function FolderControls({
  settings,
  onChange,
  disabled,
  templated = false,
}: {
  settings: FolderSettings;
  onChange: (next: FolderSettings) => void;
  disabled: boolean;
  /** Server templates were dropped in: renaming is off, whatever the switch says. */
  templated?: boolean;
}) {
  const patch = (p: Partial<FolderSettings>) => onChange({ ...settings, ...p });

  return (
    <Section title="Whole site" icon="layers" index={1}>
      <fieldset disabled={disabled} className="px-5 py-2">
        <Toggle
          label="Re-compress images, keeping their format"
          checked={settings.images}
          onChange={(on) => patch({ images: on })}
        />
        <Toggle
          label="Resize images to the size they are shown at"
          hint="Each page is rendered at phone, tablet, laptop and desktop widths, and each image is kept at its largest size there - three times that on phones, twice elsewhere, so it stays sharp on high-resolution screens. Never enlarged. An image also used from CSS, a script or a template keeps its size."
          checked={settings.rightSize}
          disabled={!settings.images}
          onChange={(on) => patch({ rightSize: on })}
        />
        <Toggle
          label="Also offer AVIF and WebP to browsers that read them"
          name="Also offer AVIF and WebP to browsers that read them"
          hint={
            <>
              Usually the biggest saving on a photo-heavy site. Off by default because it is
              the one option that changes your markup: each plain{' '}
              <code className="font-mono">&lt;img&gt;</code> is wrapped in a{' '}
              <code className="font-mono">&lt;picture&gt;</code>. Pare will not do it on a site
              whose CSS picks images by position (<code className="font-mono">.gallery &gt; img</code>),
              or on a page whose scripts change image addresses, and the before-and-after check
              compares every image&rsquo;s size and styling.
            </>
          }
          checked={settings.modern}
          disabled={!settings.images}
          onChange={(on) => patch({ modern: on })}
        />
        <Toggle
          label="Minify CSS, JavaScript, HTML and SVG"
          checked={settings.text}
          onChange={(on) => patch({ text: on })}
        />
        <Toggle
          label="Cut fonts down to the characters this site uses"
          name="Cut fonts down to the characters this site uses"
          hint="Off by default. Every page here is scanned, but a character your server produces later — from a database, a form, a translation — would not be in the font. Only fonts already in WOFF2 are touched."
          checked={settings.fonts}
          onChange={(on) => patch({ fonts: on })}
        />
        <Toggle
          label="Add a content fingerprint to filenames, so browsers can cache them forever"
          name="Add a content fingerprint to filenames, so browsers can cache them forever"
          hint={
            templated
              ? 'Off for this folder: it has PHP or other server templates, and a child theme, a plugin or the database may name these files from outside it. WordPress adds ?ver= for caching on its own.'
              : undefined
          }
          checked={settings.hash && !templated}
          disabled={templated}
          onChange={(on) => patch({ hash: on })}
        />
        <Toggle
          label={
            <>
              Combine <code className="font-mono text-xs">type="module"</code> scripts into one
              file each
            </>
          }
          name='Combine type="module" scripts into one file each'
          hint="Only modules, never ordinary scripts — a module’s imports can be followed, a plain script’s globals cannot. It is off by default because the before-and-after check runs without JavaScript, so it cannot confirm this one for you."
          checked={settings.bundle}
          onChange={(on) => patch({ bundle: on })}
        />
      </fieldset>
      <p className="flex gap-2 border-t border-rule px-5 py-3 text-xs text-muted">
        <Icon name="shield" size={14} className="mt-px flex-none text-saved" />
        <span>
          {settings.modern
            ? 'Apart from the <picture> wrappers, your markup is not restructured'
            : 'Your markup is not restructured'}{' '}
          — only addresses change, and only where every reference to a file could be traced.
          Anything Pare could not follow keeps its name and is listed below.
        </span>
      </p>
    </Section>
  );
}

/** While the verifier runs: three page frames at the three widths, being swept. */
export function Verifying({ note }: { note: string }) {
  return (
    <section className="card rise mt-4 p-6" aria-label="Checking">
      <div className="flex items-end justify-center gap-4" aria-hidden="true">
        {VIEWPORTS.map((width, i) => (
          <div key={width} className="flex flex-col items-center gap-2">
            <div
              className="relative overflow-hidden rounded-lg border border-rule bg-raised"
              style={{ width: 26 + i * 34, height: 52 + i * 8 }}
            >
              <div className="m-1.5 h-1.5 rounded bg-rule" />
              <div className="mx-1.5 h-5 rounded bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]" />
              <div className="mx-1.5 mt-1 h-1 rounded bg-rule" />
              <div
                className="absolute inset-x-0 top-0 h-5"
                style={{
                  background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-saved) 55%, transparent))',
                  animation: `scan 1.6s ease-in-out ${i * 0.25}s infinite`,
                }}
              />
            </div>
            <span className="tnum text-[11px] text-muted">{width}px</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-muted">{note || 'Rendering every page before and after…'}</p>
    </section>
  );
}

export function VerificationReport({
  report,
  settings,
  onRetry,
}: {
  report: VerifyReport;
  settings: FolderSettings;
  onRetry: (overrides: Partial<FolderSettings>) => void;
}) {
  if (report.unavailable) {
    return (
      <section className="card mt-4 border-warn/50 p-5" aria-label="Verification">
        <p className="text-sm text-warn">
          The before-and-after check could not run in this browser ({report.unavailable}),
          so the download is not offered. Nothing was changed on your computer.
        </p>
      </section>
    );
  }

  if (report.passed && report.pagesChecked === 0) {
    return (
      <section className="card pop mt-4 flex items-start gap-4 p-5" aria-label="Verification">
        <DrawnCheck />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold text-saved">Checked.</span> There are no HTML pages here
          to render — your pages are built by templates on a server, which a browser tab cannot
          run. So Pare only made changes that need no check: every file kept its name and its
          format, templates were copied exactly as they were, and nothing was renamed.
        </p>
      </section>
    );
  }

  if (report.passed) {
    return (
      <section
        className="card pop mt-4 flex items-start gap-4 border-[color-mix(in_srgb,var(--color-saved)_40%,var(--color-rule))] bg-[color-mix(in_srgb,var(--color-saved)_6%,var(--color-surface))] p-5"
        aria-label="Verification"
      >
        <DrawnCheck />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold text-saved">Checked.</span> {report.pagesChecked} page
          {report.pagesChecked === 1 ? '' : 's'} rendered before and after at{' '}
          {VIEWPORTS.join(', ')}px — every element is in the same place and every image and
          stylesheet still loads.
        </p>
      </section>
    );
  }

  return (
    <section className="card rise mt-4 border-warn p-5" aria-label="Verification">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-warn">
        <span className="grid size-6 place-items-center rounded-full bg-warn text-xs text-paper">!</span>
        Something moved. The download is not being offered.
      </h3>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        {report.findings.slice(0, 12).map((finding, i) => (
          <li key={i} className="rise" style={{ ['--i' as string]: i }}>
            <span className="font-mono text-xs text-ink">{finding.page}</span> at{' '}
            <span className="tnum">{finding.viewport}px</span> — {finding.message}
          </li>
        ))}
      </ul>
      {report.findings.length > 12 && (
        <p className="mt-2 text-xs text-muted">and {report.findings.length - 12} more.</p>
      )}
      {settings.modern ? (
        <>
          <p className="mt-4 max-w-prose text-sm text-muted">
            Offering AVIF and WebP is the only step here that changes markup. Turning it off
            leaves every <code className="font-mono">&lt;img&gt;</code> as you wrote it, and the
            images still get smaller in their own format.
          </p>
          <button onClick={() => onRetry({ modern: false })} className="btn btn-primary mt-4">
            <Icon name="refresh" size={16} />
            Turn off AVIF and WebP and check again
          </button>
        </>
      ) : settings.hash ? (
        <>
          <p className="mt-4 max-w-prose text-sm text-muted">
            Renaming files for caching is the only step here that can change what a page points
            at. Turning it off leaves every filename exactly as it was, and the files still get
            smaller.
          </p>
          <button onClick={() => onRetry({ hash: false })} className="btn btn-primary mt-4">
            <Icon name="refresh" size={16} />
            Turn off renaming and check again
          </button>
        </>
      ) : (
        <p className="mt-4 max-w-prose text-sm text-muted">
          Nothing was renamed and no markup was changed, so a minifier is the likely cause. Try
          turning off minifying and running again.
        </p>
      )}
    </section>
  );
}

/**
 * One row per file. While running it shows each worker's progress; afterwards,
 * what happened to each file - including the AVIF/WebP copies, which are new
 * files and so have no "before".
 */
export function SiteFiles({ rows, result }: { rows: Row[]; result?: FolderResult }) {
  const head = (
    <thead>
      <tr className="border-b border-rule text-left text-xs text-muted">
        <th className="py-2.5 pr-3 pl-3 font-medium">File</th>
        <th className="w-[17%] py-2.5 pr-3 text-right font-medium">Before</th>
        <th className="w-[17%] py-2.5 pr-3 text-right font-medium">After</th>
        <th className="w-[22%] py-2.5 pr-3 text-right font-medium">Change</th>
      </tr>
    </thead>
  );

  if (!result || rows.some((r) => r.state !== 'done')) {
    return (
      <div className="card mt-4 overflow-hidden">
        <table className="w-full table-fixed text-sm">
          {head}
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.asset.path} className="rise border-b border-rule last:border-0" style={{ ['--i' as string]: Math.min(i, 12) }}>
                <td className="py-2.5 pr-3 pl-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileThumb asset={row.asset} />
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-[13px] font-medium">{row.asset.path}</span>
                      <span className="block truncate text-xs text-muted">
                        {row.state === 'queued' ? 'waiting' : row.state === 'running' ? row.label : 'done'}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="tnum py-2.5 pr-3 text-right text-muted">{bytes(row.asset.bytes.byteLength)}</td>
                <td />
                <td className="py-2.5 pr-3 text-right">
                  {row.state === 'running' && (
                    <span className="progress ml-auto block w-full max-w-24" role="progressbar" aria-label={row.asset.path + ' progress'} aria-valuenow={Math.round(row.progress * 100)}>
                      <i style={{ width: `${Math.max(4, row.progress * 100)}%` }} />
                    </span>
                  )}
                  {row.state === 'done' && (
                    <span className="pop ml-auto inline-grid size-5 place-items-center rounded-full bg-saved text-paper">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <details className="card group mt-4 overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold">
        Every file ({result.files.length})
        <Icon name="arrow" size={16} className="text-muted transition-transform duration-300 group-open:rotate-90" />
      </summary>
      <div className="border-t border-rule">
        <table className="w-full table-fixed text-sm">
          {head}
          <tbody>
            {result.files.map((file) => {
              const after = file.bytesServed ?? file.bytes.byteLength;
              const cut = file.siblingOf ? 0 : reduction(file.bytesBefore, after);
              const detail = file.siblingOf
                ? 'new copy of ' + file.siblingOf
                : [
                    file.resized ? `scaled from ${file.resized.from} to ${file.resized.to}px wide` : '',
                    file.skipped ?? (file.outputPath !== file.path ? 'renamed ' + file.outputPath : ''),
                  ]
                    .filter(Boolean)
                    .join(' · ');
              return (
                <tr key={file.outputPath} className="border-b border-rule last:border-0">
                  <td className="py-2.5 pr-3 pl-3">
                    <span className="block truncate font-mono text-[13px] font-medium">{file.path}</span>
                    <span className="block text-xs break-words text-muted">{detail}</span>
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right text-muted">
                    {file.siblingOf ? '—' : bytes(file.bytesBefore)}
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right font-medium">{bytes(after)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {cut > 0 ? (
                      <span className="pill-saved">{cut}% smaller</span>
                    ) : (
                      <span className="text-xs text-muted">{file.siblingOf ? 'new' : 'no change'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function FolderSummary({ result }: { result: FolderResult }) {
  const originals = result.files.filter((f) => !f.siblingOf);
  const before = originals.reduce((n, f) => n + f.bytesBefore, 0);
  // What a visitor downloads: the smallest version of each image a browser picks.
  const after = originals.reduce((n, f) => n + (f.bytesServed ?? f.bytes.byteLength), 0);
  const zip = result.files.reduce((n, f) => n + f.bytes.byteLength, 0);
  const cut = reduction(before, after);

  return (
    <section className="card rise mt-4 overflow-hidden" aria-label="Site savings">
      <div className="p-6">
        <p className="eyebrow">Whole site</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="tnum text-muted">{bytes(before)}</span>
          <span className="text-muted" aria-hidden="true">→</span>
          <span className="tnum">
            <Ticker from={before} to={after} format={bytes} />
          </span>
          {cut > 0 && (
            <span className="relative">
              <span className="pill-saved pop px-3 py-1 text-base">{cut}% smaller</span>
              {cut >= 20 && <Burst />}
            </span>
          )}
        </p>
        <SavingBars before={before} after={after} />
        <p className="mt-4 max-w-prose text-sm text-muted">
          {result.files.length} files &middot; {result.renamed.size} fingerprinted &middot;{' '}
          {result.rewritten} address{result.rewritten === 1 ? '' : 'es'} updated
          {result.locationsRemoved > 0 &&
            ` · location removed from ${result.locationsRemoved} photo${result.locationsRemoved === 1 ? '' : 's'}`}
          {result.resized > 0 &&
            ` · ${result.resized} image${result.resized === 1 ? '' : 's'} scaled down to the size ${result.resized === 1 ? 'it is' : 'they are'} shown at`}
          .
          {result.pictures > 0 ? (
            <>
              {' '}
              {result.pictures} image{result.pictures === 1 ? '' : 's'} now offer AVIF or WebP; the
              figure above counts the smallest version a browser picks. The zip holds{' '}
              <span className="tnum">{bytes(zip)}</span> because it carries every version.
            </>
          ) : (
            ' This is the whole folder, so it is a straight before-and-after: every file here replaces the one it came from.'
          )}
        </p>
      </div>
    </section>
  );
}

/** The saving as two bars: the original length, and the length that is left. */
export function SavingBars({ before, after }: { before: number; after: number }) {
  const ratio = before > 0 ? Math.max(0.01, after / before) : 1;
  return (
    <div className="mt-5 grid gap-2" aria-hidden="true">
      <div className="h-3 rounded-full bg-[color-mix(in_srgb,var(--color-muted)_45%,transparent)]" />
      <div className="h-3 overflow-hidden rounded-full bg-rule">
        <div
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: 'linear-gradient(90deg, var(--color-saved), color-mix(in srgb, var(--color-saved) 50%, var(--color-accent)))',
            animation: 'shrink-in 1.3s var(--ease-out-expo) 0.15s both',
          }}
        />
      </div>
    </div>
  );
}

export function FolderWarnings({ result }: { result: FolderResult }) {
  if (result.warnings.length === 0) return null;

  return (
    <details className="card group mt-4 overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-warn)_18%,transparent)] text-[11px] text-warn">
            {result.warnings.length}
          </span>
          Left alone ({result.warnings.length})
        </span>
        <Icon name="arrow" size={16} className="text-muted transition-transform duration-300 group-open:rotate-90" />
      </summary>
      <ul className="space-y-3 border-t border-rule px-5 py-4 text-sm">
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
