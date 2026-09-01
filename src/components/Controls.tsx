import {
  DEFAULT_WIDTHS,
  FORMAT_LABEL,
  TARGETS,
  type FontSettings,
  type ImageSettings,
  type OutputFormat,
  type SubsetMode,
  type TargetPreset,
  type TextSettings,
} from '../lib/settings';
import type { Settings } from '../lib/optimize';

/**
 * Every switch in AGENTS.md's definition of done lives here. Nothing the
 * pipelines do is unconditional, and nothing is hidden behind an "advanced"
 * disclosure - a user who cannot see a toggle cannot trust that it is off.
 *
 * Sections appear only for the kinds of file actually dropped in. Showing font
 * controls to someone who dropped photographs is noise.
 */

const FORMATS: OutputFormat[] = ['avif', 'webp', 'fallback'];

function parseWidths(text: string): number[] {
  const parsed = text
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_WIDTHS;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border border-rule" aria-label={title}>
      <h2 className="border-b border-rule px-5 py-3 text-sm tracking-wide text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

const check = 'flex items-center gap-2 text-sm';
const field = 'mt-1 w-full border border-rule bg-white px-2 py-1 font-mono text-xs';

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

function ImageControls({
  settings,
  onChange,
}: {
  settings: ImageSettings;
  onChange: (next: ImageSettings) => void;
}) {
  const patch = (p: Partial<ImageSettings>) => onChange({ ...settings, ...p });

  return (
    <div className="grid gap-6 p-5 md:grid-cols-2">
      <div>
        {FORMATS.map((format) => (
          <div key={format} className="mb-4 last:mb-0">
            <label className={check}>
              <input
                type="checkbox"
                checked={settings.formats[format]}
                onChange={(e) =>
                  patch({ formats: { ...settings.formats, [format]: e.target.checked } })
                }
              />
              {FORMAT_LABEL[format]}
            </label>
            <div className="mt-1 flex items-center gap-3 pl-6">
              <input
                type="range"
                min={1}
                max={100}
                value={settings.quality[format]}
                disabled={!settings.formats[format]}
                aria-label={FORMAT_LABEL[format] + ' quality'}
                onChange={(e) =>
                  patch({ quality: { ...settings.quality, [format]: Number(e.target.value) } })
                }
                className="w-40 accent-ink disabled:opacity-30"
              />
              <span className="tnum text-xs text-muted">quality {settings.quality[format]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid content-start gap-4">
        <label className="block text-sm">
          Widths
          <input
            type="text"
            defaultValue={settings.widths.join(', ')}
            onBlur={(e) => patch({ widths: parseWidths(e.target.value) })}
            className={field}
          />
          <span className="mt-1 block text-xs text-muted">
            Widths larger than an image are dropped. Nothing is ever upscaled.
          </span>
        </label>

        <label className="block text-sm">
          <code className="font-mono text-xs">sizes</code> attribute
          <input
            type="text"
            defaultValue={settings.sizes}
            onBlur={(e) => patch({ sizes: e.target.value })}
            className={field}
          />
        </label>

        <label className={check}>
          <input
            type="checkbox"
            checked={settings.stripMetadata}
            onChange={(e) => patch({ stripMetadata: e.target.checked })}
          />
          Remove EXIF and other metadata
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.thumbhash}
            onChange={(e) => patch({ thumbhash: e.target.checked })}
          />
          Generate blurred placeholders
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.lazy}
            onChange={(e) => patch({ lazy: e.target.checked })}
          />
          Add <code className="font-mono text-xs">loading=&quot;lazy&quot;</code> to the snippet
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Fonts
 * ------------------------------------------------------------------ */

const MODES: Array<{ value: SubsetMode; label: string; note: string }> = [
  {
    value: 'split',
    label: 'Split by script',
    note: 'Keeps every character. One file per writing system, and the browser downloads only the ones a page uses. Nothing can go missing.',
  },
  {
    value: 'used',
    label: 'Keep only characters I use',
    note: 'Smallest result, and the only option that can go wrong: characters your pages produce later - from a database, a form, or JavaScript - will be missing.',
  },
  {
    value: 'keep',
    label: 'Keep everything in one file',
    note: 'No characters removed and no splitting. Just repacked as WOFF2.',
  },
];

function FontControls({
  settings,
  onChange,
}: {
  settings: FontSettings;
  onChange: (next: FontSettings) => void;
}) {
  const patch = (p: Partial<FontSettings>) => onChange({ ...settings, ...p });
  const active = MODES.find((m) => m.value === settings.mode);

  return (
    <div className="grid gap-6 p-5 md:grid-cols-2">
      <div>
        <fieldset>
          <legend className="mb-2 text-sm">What to keep</legend>
          {MODES.map((mode) => (
            <label key={mode.value} className={check + ' mb-1'}>
              <input
                type="radio"
                name="subset-mode"
                checked={settings.mode === mode.value}
                onChange={() => patch({ mode: mode.value })}
              />
              {mode.label}
            </label>
          ))}
        </fieldset>
        {active && <p className="mt-3 max-w-prose text-xs text-muted">{active.note}</p>}
      </div>

      <div className="grid content-start gap-4">
        {settings.mode === 'used' && (
          <label className="block text-sm">
            Text to keep, on top of any HTML or CSS you dropped in
            <textarea
              rows={3}
              defaultValue={settings.extraText}
              onBlur={(e) => patch({ extraText: e.target.value })}
              className={field}
              placeholder="Paste any wording that is not in the files above"
            />
            <span className="mt-1 block text-xs text-muted">
              Letters, digits and punctuation are always kept, whatever you paste.
            </span>
          </label>
        )}

        <label className="block text-sm">
          <code className="font-mono text-xs">font-display</code>
          <select
            value={settings.display}
            onChange={(e) => patch({ display: e.target.value as FontSettings['display'] })}
            className={field}
          >
            <option value="swap">swap</option>
            <option value="optional">optional</option>
            <option value="fallback">fallback</option>
            <option value="block">block</option>
            <option value="auto">auto</option>
          </select>
        </label>

        <label className={check}>
          <input
            type="checkbox"
            checked={settings.preload}
            onChange={(e) => patch({ preload: e.target.checked })}
          />
          Add a preload tag for the first file
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

const TEXT_TOGGLES: Array<{ key: keyof TextSettings; label: string }> = [
  { key: 'css', label: 'Minify CSS' },
  { key: 'js', label: 'Minify JavaScript' },
  { key: 'html', label: 'Minify HTML' },
  { key: 'svg', label: 'Minify SVG' },
];

function TextControls({
  settings,
  onChange,
}: {
  settings: TextSettings;
  onChange: (next: TextSettings) => void;
}) {
  const patch = (p: Partial<TextSettings>) => onChange({ ...settings, ...p });

  return (
    <div className="grid gap-6 p-5 md:grid-cols-2">
      <div className="grid content-start gap-1">
        {TEXT_TOGGLES.map(({ key, label }) => (
          <label key={key} className={check}>
            <input
              type="checkbox"
              checked={settings[key] as boolean}
              onChange={(e) => patch({ [key]: e.target.checked } as Partial<TextSettings>)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="grid content-start gap-4">
        <label className="block text-sm">
          Browsers to support
          <select
            value={settings.target}
            onChange={(e) => patch({ target: e.target.value as TargetPreset })}
            className={field}
          >
            {Object.entries(TARGETS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className={check}>
          <input
            type="checkbox"
            checked={settings.gzip}
            onChange={(e) => patch({ gzip: e.target.checked })}
          />
          Also write <code className="font-mono text-xs">.gz</code> copies
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={settings.brotli}
            onChange={(e) => patch({ brotli: e.target.checked })}
          />
          Also write <code className="font-mono text-xs">.br</code> copies
          <span className="text-xs text-muted">(downloads a 200 KB compressor)</span>
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

export type Present = { image: boolean; font: boolean; text: boolean };

export function Controls({
  settings,
  onChange,
  disabled,
  present,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  disabled: boolean;
  present: Present;
}) {
  return (
    <fieldset disabled={disabled} className="contents">
      {present.image && (
        <Section title="Images">
          <ImageControls
            settings={settings.image}
            onChange={(image) => onChange({ ...settings, image })}
          />
          <p className="border-t border-rule px-5 py-3 text-xs text-muted">
            Colour profiles are always kept. Rotation stored in EXIF is applied to the
            pixels before the metadata is dropped, so nothing turns sideways.
          </p>
        </Section>
      )}

      {present.font && (
        <Section title="Fonts">
          <FontControls
            settings={settings.font}
            onChange={(font) => onChange({ ...settings, font })}
          />
        </Section>
      )}

      {present.text && (
        <Section title="CSS, JavaScript, HTML and SVG">
          <TextControls
            settings={settings.text}
            onChange={(text) => onChange({ ...settings, text })}
          />
          <p className="border-t border-rule px-5 py-3 text-xs text-muted">
            Minifying rewrites; it never removes. No CSS rule, no element, no
            attribute and no JavaScript export is deleted, so nothing that worked
            before can stop working.
          </p>
        </Section>
      )}
    </fieldset>
  );
}
