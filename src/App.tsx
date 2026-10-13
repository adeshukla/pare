import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controls, type Present } from './components/Controls';
import { DropZone } from './components/DropZone';
import {
  FolderControls,
  FolderSummary,
  FolderWarnings,
  SiteFiles,
  VerificationReport,
  Verifying,
} from './components/FolderPanel';
import { Features, Steps } from './components/Hero';
import { Results } from './components/Results';
import { FilesSavings } from './components/Savings';
import { UnusedCss } from './components/UnusedCss';
import { Backdrop, Icon, Logo, ThemeToggle, Toast } from './components/Visuals';
import { buildZip, download, outputFiles, zipToBlob } from './lib/emit';
import { usePersistent } from './lib/persist';
import { canSaveToFolder, saveToFolder } from './lib/save-folder';
import { registerOffline } from './offline';
import {
  distFiles,
  FOLDER_DEFAULTS,
  optimizeFolder,
  toVirtual,
  verificationInputs,
  type FolderResult,
  type FolderSettings,
} from './lib/folder';
import { isTextKind, newRow, optimizeAssets, summarise, type Row, type Settings } from './lib/optimize';
import { poolSize, warmUp } from './lib/pool';
import { DEFAULTS, FONT_DEFAULTS, TEXT_DEFAULTS } from './lib/settings';
import type { Asset } from './lib/types';
import { verify, type VerifyReport } from './lib/verify';
import { TASKS, taskPath } from './tasks';

/** Set on a task page's <html> by scripts/make-task-pages.mjs (ADR-035). */
const TASK = TASKS.find((t) => t.slug === document.documentElement.dataset.task);

const INITIAL: Settings = {
  image: { ...DEFAULTS, ...TASK?.image },
  font: FONT_DEFAULTS,
  text: TEXT_DEFAULTS,
};

type Mode = 'files' | 'site';

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = usePersistent<Settings>(
    // Each task page remembers its own choices, so one never overrides another.
    TASK ? 'pare:settings:' + TASK.slug : 'pare:settings',
    INITIAL,
  );
  const [folderSettings, setFolderSettings] = usePersistent<FolderSettings>(
    'pare:site-settings',
    FOLDER_DEFAULTS,
  );
  const [offline, setOffline] = useState(false);
  const [mode, setMode] = useState<Mode>('files');
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [note, setNote] = useState('');
  const [folder, setFolder] = useState<FolderResult>();
  const [verification, setVerification] = useState<VerifyReport>();
  const [toast, setToast] = useState<{ id: number; text: string }>();

  useEffect(() => {
    void registerOffline().then(setOffline);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast({ id: Date.now(), text });

  const present: Present = useMemo(
    () => ({
      image: rows.some((r) => r.asset.kind === 'image'),
      font: rows.some((r) => r.asset.kind === 'font'),
      text: rows.some((r) => isTextKind(r.asset.kind)),
      // The biggest photo-like image: the one whose cost a slider most changes.
      sample: rows
        .map((r) => r.asset)
        .filter((a) => a.kind === 'image' && a.mime !== 'image/gif')
        .sort((a, b) => b.bytes.byteLength - a.bytes.byteLength)[0],
    }),
    [rows],
  );

  const pages = rows.filter((r) => r.asset.kind === 'html').length;
  const templates = rows.filter((r) => r.asset.kind === 'template').length;
  const siteParts = [
    pages > 0 ? `${pages} page${pages === 1 ? '' : 's'}` : '',
    templates > 0 ? `${templates} template${templates === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const workable = rows.filter(
    (r) => r.asset.kind === 'image' || r.asset.kind === 'font' || isTextKind(r.asset.kind),
  ).length;

  const report = useMemo(() => summarise(rows), [rows]);
  const finished = rows.filter((r) => r.state === 'done').length;
  const counts = useMemo(() => {
    const images = rows.filter((r) => r.asset.kind === 'image').length;
    const fonts = rows.filter((r) => r.asset.kind === 'font').length;
    const code = rows.filter((r) => isTextKind(r.asset.kind)).length;
    return [
      [images, images === 1 ? 'image' : 'images'],
      [fonts, fonts === 1 ? 'font' : 'fonts'],
      [code, 'code'],
      [rows.length - images - fonts - code, 'other'],
    ].filter(([n]) => (n as number) > 0) as Array<[number, string]>;
  }, [rows]);

  const accept = useCallback((assets: Asset[], notes: string[] = []) => {
    if (assets.length === 0) {
      setNote(notes.join(' ') || 'Nothing readable in that drop.');
      return;
    }
    setNote(notes.join(' '));
    setRan(false);
    setFolder(undefined);
    setVerification(undefined);
    setRows(assets.map(newRow));

    // Start loading the image encoders now, while the settings are read.
    const images = assets.filter((a) => a.kind === 'image');
    if (images.length > 0) {
      const kinds = ['avif', 'webp'];
      if (images.some((a) => a.mime === 'image/jpeg' || a.mime === 'image/heic')) kinds.push('jpeg');
      if (images.some((a) => a.mime === 'image/png' || a.mime === 'image/bmp' || a.mime === 'image/gif')) kinds.push('png');
      // As many workers as the run will keep busy; a lone image is split by
      // format and width (ADR-032), so it uses several.
      warmUp(kinds, images.length < poolSize ? images.length * 9 : poolSize);
    }

    // A drop containing pages is a site; that is what folder mode is for.
    // A WordPress theme has templates and no .html at all; it is still a site.
    setMode(assets.some((a) => a.kind === 'html' || a.kind === 'template') ? 'site' : 'files');
  }, []);

  async function runFiles() {
    const update = (index: number, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    const done = await optimizeAssets(
      rows.map((r) => r.asset),
      settings,
      update,
    );
    setRows(done);
  }

  async function runSite(overrides?: Partial<FolderSettings>) {
    const active = { ...folderSettings, ...overrides };
    if (overrides) setFolderSettings(active);
    setVerification(undefined);

    const assets = rows.map((r) => r.asset);
    const result = await optimizeFolder(
      assets,
      settings,
      active,
      (path, ratio, label) =>
        setRows((prev) =>
          prev.map((r) =>
            r.asset.path === path
              ? { ...r, state: ratio >= 1 ? 'done' : 'running', progress: ratio, label }
              : r,
          ),
        ),
      setNote,
    );
    setFolder(result);
    setRows((prev) => prev.map((r) => ({ ...r, state: 'done', progress: 1, label: '' })));

    const { before, after } = verificationInputs(assets, result);
    setNote('Rendering every page before and after…');
    const checked = await verify(before, after, result.pages, (_, label) =>
      setNote('Rendering every page before and after, at three widths — ' + label + ' done…'),
    );
    setNote('');
    setVerification(checked);
  }

  async function go(overrides?: Partial<FolderSettings>) {
    setRunning(true);
    setNote('');
    // A second run starts from nothing, so its progress counts from zero.
    setRows((prev) => prev.map((r) => newRow(r.asset)));
    setRan(false);
    setFolder(undefined);
    try {
      if (mode === 'site') await runSite(overrides);
      else await runFiles();
      setRan(true);
    } finally {
      setRunning(false);
    }
  }

  function downloadSite() {
    if (!folder) return;
    download(zipToBlob(distFiles(folder)), 'pare-site.zip');
  }

  async function save(files: Record<string, Uint8Array>) {
    try {
      const result = await saveToFolder(files, (done, total) =>
        setNote(`Saving ${done} of ${total} files…`),
      );
      if ('refused' in result) {
        setNote(result.refused);
      } else {
        setNote('');
        say(`Saved ${result.written} file${result.written === 1 ? '' : 's'} to the folder you chose`);
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
      setNote('Could not write to that folder. Nothing in it was changed; the zip download still works.');
    }
  }

  function startOver() {
    setRows([]);
    setRan(false);
    setFolder(undefined);
    setVerification(undefined);
    setNote('');
  }

  const snippetCount = rows.filter((r) => r.snippet).length;
  async function copyAllSnippets() {
    const all = rows
      .filter((r) => r.snippet)
      .map((r) => r.snippet)
      .join('\n\n');
    await navigator.clipboard.writeText(all);
    say(snippetCount === 1 ? 'Snippet copied' : `${snippetCount} snippets copied`);
  }

  const verified = verification?.passed === true;
  const verifying = running && mode === 'site' && folder !== undefined && !verification;
  const started = rows.length > 0;

  const runLabel = running
    ? 'Working…'
    : mode === 'site'
      ? 'Optimize the site'
      : 'Optimize ' + workable + (workable === 1 ? ' file' : ' files');

  return (
    <>
      <Backdrop />

      <header className="sticky top-0 z-40 border-b border-transparent bg-paper/70 backdrop-blur-xl supports-[backdrop-filter]:bg-paper/60">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button onClick={startOver} className="rounded-lg" aria-label="Pare — back to the start">
            <Logo />
          </button>
          <div className="flex items-center gap-2">
            <span className="chip hidden sm:inline-flex">
              <Icon name="shield" size={13} className="text-saved" />
              Nothing leaves this tab
            </span>
            {offline && (
              <span className="chip pop hidden sm:inline-flex">
                <Icon name="offline" size={13} className="text-accent" />
                Works offline
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
        {/* One top-level heading always, for screen readers and outlines; the
            visible one is part of the landing page. */}
        {started && <h1 className="sr-only">Pare — optimize your files</h1>}
        {!started && (
          <section className="mx-auto max-w-3xl text-center">
            <p className="rise chip mx-auto" style={{ ['--i' as string]: 0 }}>
              <Icon name="sparkle" size={13} className="text-accent" />
              {TASK ? 'Free · private · works offline' : 'Images · fonts · code · whole sites'}
            </p>
            <h1
              className="rise mt-5 font-[family-name:var(--font-display)] text-5xl leading-[1.02] font-bold tracking-[-0.035em] sm:text-7xl"
              style={{ ['--i' as string]: 0 }}
            >
              {TASK ? TASK.heading[0] : 'Pare it'}{' '}
              <span className="gradient-text">{TASK ? TASK.heading[1] : 'down.'}</span>
            </h1>
            <p className="rise mx-auto mt-5 max-w-xl text-lg text-muted" style={{ ['--i' as string]: 1 }}>
              {TASK
                ? TASK.lede
                : 'Shrink your images, fonts and code, and get the markup to use them. Files are read in this tab and never sent anywhere — there is no server to send them to.'}
            </p>
          </section>
        )}

        <div className={started ? '' : 'mx-auto mt-10 max-w-3xl'}>
          <DropZone onAssets={accept} compact={started} />
        </div>

        {/* Always in the tree, so screen readers hear each change of status. */}
        <p role="status" aria-live="polite" className="mt-4 text-center text-sm text-muted empty:hidden">
          {verifying ? '' : note}
        </p>

        {!started && (
          <>
            <Features />
            <Steps />
          </>
        )}

        {started && (
          <>
            {(pages > 0 || templates > 0) && (
              <div className="rise mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What to do">
                {(
                  [
                    ['site', `Optimize the whole site (${siteParts})`, templates > 0 ? 'Every file shrinks in place under its own name. Templates are never touched, so a WordPress or PHP site keeps working.' : 'Every file shrinks in place, addresses stay correct, and each page is checked before you can download.', 'layers'],
                    ['files', 'Just give me optimized files and snippets', 'AVIF, WebP, fonts and minified code, with markup to paste where you like.', 'image'],
                  ] as const
                ).map(([value, label, hint, icon]) => (
                  <label
                    key={value}
                    className={`card relative flex cursor-pointer gap-3 p-4 transition-all duration-300 ${
                      mode === value
                        ? 'border-accent ring-4 ring-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]'
                        : 'hover:-translate-y-0.5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === value}
                      disabled={running}
                      onChange={() => {
                        setMode(value);
                        setRan(false);
                      }}
                      className="mt-1 size-4 accent-[var(--color-accent)]"
                    />
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Icon name={icon} size={15} className="text-accent" />
                        {label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
              <aside className="grid gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1 lg:pb-4">
                {mode === 'site' ? (
                  <FolderControls
                    templated={templates > 0}
                    settings={folderSettings}
                    onChange={setFolderSettings}
                    disabled={running}
                  />
                ) : (
                  <Controls
                    settings={settings}
                    onChange={setSettings}
                    disabled={running}
                    present={present}
                  />
                )}
              </aside>

              <div className="order-first min-w-0 lg:order-none">
                <section className="card rise overflow-hidden" aria-label="Run" style={{ ['--i' as string]: 1 }}>
                  <div className="flex flex-wrap items-center gap-4 p-5">
                    <button
                      onClick={() => void go()}
                      disabled={running || (mode === 'files' && workable === 0)}
                      className="btn btn-primary btn-lg w-full sm:w-auto"
                    >
                      {running ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
                      ) : (
                        <Icon name="sparkle" size={18} />
                      )}
                      {runLabel}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap gap-1.5">
                        {counts.map(([n, label]) => (
                          <span key={label} className="chip tnum">
                            {n} {label}
                          </span>
                        ))}
                      </p>
                      <p className="mt-1.5 text-xs text-muted">
                        {rows.length} dropped &middot; {poolSize} worker{poolSize === 1 ? '' : 's'}
                      </p>
                    </div>
                    {!running && (
                      <button onClick={startOver} className="btn btn-ghost btn-sm">
                        <Icon name="refresh" size={14} />
                        Start over
                      </button>
                    )}
                  </div>
                  {running && (
                    <div className="border-t border-rule px-5 py-3">
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>{verifying ? 'Checking pages' : 'Optimizing'}</span>
                        <span className="tnum">
                          {finished} of {rows.length} done
                        </span>
                      </div>
                      <span
                        className="progress mt-2 block"
                        role="progressbar"
                        aria-label="Files finished"
                        aria-valuemin={0}
                        aria-valuemax={rows.length}
                        aria-valuenow={finished}
                      >
                        <i style={{ width: `${Math.max(3, (finished / Math.max(1, rows.length)) * 100)}%` }} />
                      </span>
                    </div>
                  )}
                </section>

                {mode === 'site' && running && !verifying && <SiteFiles rows={rows} />}
                {verifying && <Verifying note={note} />}

                {ran && mode === 'site' && folder && (
                  <>
                    <FolderSummary result={folder} />
                    {verification && (
                      <VerificationReport
                        report={verification}
                        settings={folderSettings}
                        onRetry={(overrides) => void go(overrides)}
                      />
                    )}
                    {verified && (
                      <div className="card rise mt-4 flex flex-wrap items-center gap-3 p-5">
                        <button onClick={downloadSite} className="btn btn-primary">
                          <Icon name="download" size={16} />
                          Download site
                        </button>
                        {canSaveToFolder() && (
                          <button onClick={() => folder && void save(distFiles(folder))} className="btn">
                            <Icon name="folder" size={16} />
                            Save to a folder…
                          </button>
                        )}
                        <p className="basis-full text-xs text-muted">
                          Upload the contents in place of your folder. Your original files are
                          untouched.
                        </p>
                      </div>
                    )}
                    <FolderWarnings result={folder} />
                    <SiteFiles rows={rows} result={folder} />
                    {folder.pages.length > 0 && (
                      <UnusedCss files={toVirtual(rows.map((r) => r.asset))} pages={folder.pages} />
                    )}
                  </>
                )}

                {ran && mode === 'files' && (
                  <FilesSavings report={report}>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => download(buildZip(rows), 'pare-output.zip')}
                        className="btn btn-primary"
                      >
                        <Icon name="download" size={16} />
                        Download zip
                      </button>
                      {canSaveToFolder() && (
                        <button onClick={() => void save(outputFiles(rows))} className="btn">
                          <Icon name="folder" size={16} />
                          Save to a folder…
                        </button>
                      )}
                      {snippetCount > 0 && (
                        <button onClick={() => void copyAllSnippets()} className="btn">
                          <Icon name="copy" size={16} />
                          {snippetCount === 1 ? 'Copy snippet' : `Copy all ${snippetCount} snippets`}
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      Includes <code className="font-mono">snippets.html</code> with every generated
                      tag. Your original files are untouched.
                    </p>
                  </FilesSavings>
                )}

                {mode === 'files' && <Results rows={rows} />}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <Logo />
          <nav aria-label="Tools" className="flex flex-wrap gap-x-4 gap-y-1">
            {TASK && (
              <a href="/" className="hover:text-ink">
                Everything Pare does
              </a>
            )}
            {TASKS.filter((t) => t !== TASK).map((t) => (
              <a key={t.slug} href={taskPath(t)} className="hover:text-ink">
                {t.name}
              </a>
            ))}
          </nav>
          <p>
            No upload, no account, no server.
            {offline &&
              ' Anything you have used once in this browser keeps working without a connection.'}
          </p>
        </div>
      </footer>

      <Toast toast={toast} />
    </>
  );
}
