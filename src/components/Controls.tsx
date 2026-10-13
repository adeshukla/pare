import {
  DEFAULT_WIDTHS,
  FORMAT_LABEL,
  JS_LEVELS,
  TARGETS,
  type JsLevel,
  type FontSettings,
  type ImageSettings,
  type OutputFormat,
  type SubsetMode,
  type TargetPreset,
  type TextSettings,
} from '../lib/settings';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { bytes as formatBytes } from '../lib/format';
import type { Settings } from '../lib/optimize';
import { run } from '../lib/pool';
import type { Asset } from '../lib/types';
import { Icon, Segmented, type IconName } from './Visuals';

/**
 * Every switch in AGENTS.md's definition of done lives here. Nothing the
 * pipelines do is unconditional, and nothing is hidden behind an "advanced"
 * disclosure - a user who cannot see a toggle cannot trust that it is off.
 *
 * Sections appear only for the kinds of file actually dropped in. Showing font
 * controls to someone who dropped photographs is noise.
 */

const FORMATS: OutputFormat[] = ['avif', 'webp', 'fallback'];

const FORMAT_HINT: Record<OutputFormat, string> = {
  avif: 'Smallest. Read by every current browser.',
  webp: 'For browsers that cannot read AVIF.',
  fallback: 'The format you gave it, re-encoded. Everyone can read it.',
};

/**
 * Starting points for the three quality sliders. Each format's scale is its
 * own - AVIF 50 looks about like WebP 75 and JPEG 75 - so a preset moves all
 * three together. "Balanced" is the default, and close to what the encoders'
 * own authors recommend for photographs.
 */
type QualityPreset = 'small' | 'balanced' | 'crisp' | 'custom';
const QUALITY_PRESETS: Record<Exclude<QualityPreset, 'custom'>, Record<OutputFormat, number>> = {
  small: { avif: 38, webp: 62, fallback: 62 },
  balanced: { avif: 50, webp: 75, fallback: 75 },
  crisp: { avif: 64, webp: 86, fallback: 86 },
};
const PRESET_LABEL: Record<QualityPreset, string> = {
  small: 'Smallest',
  balanced: 'Balanced',
  crisp: 'Crisp',
  custom: 'Custom',
};

function presetOf(quality: Record<OutputFormat, number>): QualityPreset {
  for (const [name, q] of Object.entries(QUALITY_PRESETS)) {
    if (FORMATS.every((f) => q[f as OutputFormat] === quality[f])) return name as QualityPreset;
  }
  return 'custom';
}

/** A whole number above zero, or null for "not set". */
function positive(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseWidths(text: string): number[] {
  const parsed = text
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_WIDTHS;
}

export function Section({
  title,
  icon,
  children,
  index = 0,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
  index?: number;
}) {
  return (
    <section className="card rise @container" aria-label={title} style={{ ['--i' as string]: index }}>
      <h2 className="card-head">
        <span className="grid size-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">
          <Icon name={icon} size={15} />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A labelled switch. `name` is the accessible name when the visible label holds
 * markup or a hint, so "WebP" stays "WebP" to a screen reader and to a test.
 */
export function Toggle({
  label,
  name,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  name?: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <label className="option">
      <span>
        <span className="font-medium">{label}</span>
        {hint && <small id={hintId}>{hint}</small>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-label={name ?? (typeof label === 'string' ? label : undefined)}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

/**
 * What one format at one quality costs, measured on a real dropped image.
 *
 * Encodes in the pool, never here, and waits for the slider to settle first: an
 * AVIF encode is a second or so, and a drag fires dozens of change events.
 */
function SizePreview({
  sample,
  format,
  quality,
  disabled,
}: {
  sample: Asset;
  format: OutputFormat;
  quality: number;
  disabled: boolean;
}) {
  const [shown, setShown] = useState<{ text: string; for: string }>();
  const wanted = `${sample.path}:${format}:${quality}`;

  useEffect(() => {
    if (disabled) return;
    let current = true;
    const timer = setTimeout(() => {
      void run((api) =>
        api.previewSize(sample.path, sample.mime, sample.bytes, format, quality),
      ).then((size) => {
        if (!current) return;
        setShown({
          for: wanted,
          text: size ? `≈ ${formatBytes(size.bytes)} at ${size.width}px` : '',
        });
      });
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [sample, format, quality, disabled, wanted]);

  const settled = shown?.for === wanted;
  return (
    <span
      className={`chip tnum transition-opacity ${settled ? 'opacity-100' : 'animate-pulse opacity-70'}`}
      aria-live="polite"
    >
      {settled ? shown.text : disabled ? '' : 'measuring…'}
    </span>
  );
}

function ImageControls({
  settings,
  onChange,
  sample,
  disabled,
}: {
  settings: ImageSettings;
  onChange: (next: ImageSettings) => void;
  sample?: Asset;
  disabled: boolean;
}) {
  const patch = (p: Partial<ImageSettings>) => onChange({ ...settings, ...p });

  return (
    <div className="grid gap-x-8 gap-y-2 p-5 @2xl:grid-cols-2">
      <div>
        <div className="mb-3">
          <p className="eyebrow mb-2">Quality</p>
          <Segmented
            name="quality-preset"
            label="Quality"
            value={presetOf(settings.quality)}
            onChange={(preset: QualityPreset) => {
              if (preset !== 'custom') patch({ quality: { ...QUALITY_PRESETS[preset] } });
            }}
            options={(['small', 'balanced', 'crisp', ...(presetOf(settings.quality) === 'custom' ? ['custom'] : [])] as QualityPreset[]).map(
              (value) => ({ value, label: PRESET_LABEL[value] }),
            )}
          />
        </div>
        <p className="eyebrow mb-1">Formats</p>
        {FORMATS.map((format) => (
          <div key={format} className="border-b border-rule pb-3 last:border-0">
            <Toggle
              label={FORMAT_LABEL[format]}
              name={FORMAT_LABEL[format]}
              hint={FORMAT_HINT[format]}
              checked={settings.formats[format]}
              onChange={(on) => patch({ formats: { ...settings.formats, [format]: on } })}
            />
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <span className="tnum w-8 text-xs font-semibold text-muted">{settings.quality[format]}</span>
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
                className="range"
                style={{ ['--fill' as string]: settings.quality[format] }}
              />
            </div>
            {sample && settings.formats[format] && (
              <div className="mt-1.5 pl-11">
                <SizePreview
                  sample={sample}
                  format={format}
                  quality={settings.quality[format]}
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid content-start gap-3">
        <p className="eyebrow">Sizes and markup</p>
        <div>
          <Segmented
            name="image-output"
            label="Output"
            value={settings.output}
            onChange={(output: ImageSettings['output']) => patch({ output })}
            options={[
              { value: 'responsive', label: 'Responsive set' },
              { value: 'single', label: 'One size' },
            ]}
          />
          <span className="mt-1.5 block text-xs text-muted">
            {settings.output === 'responsive'
              ? 'Several widths, and markup that lets each screen download the one it needs.'
              : 'One file per format at the size you set. For a thumbnail, an avatar, or an image you place yourself.'}
          </span>
        </div>

        {settings.output === 'single' ? (
          <div className="rise grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Width
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="auto"
                  defaultValue={settings.single.width ?? ''}
                  onBlur={(e) => patch({ single: { ...settings.single, width: positive(e.target.value) } })}
                  className="field"
                />
              </label>
              <label className="block text-sm font-medium">
                Height
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="auto"
                  defaultValue={settings.single.height ?? ''}
                  onBlur={(e) => patch({ single: { ...settings.single, height: positive(e.target.value) } })}
                  className="field"
                />
              </label>
            </div>
            <Segmented
              name="image-fit"
              label="Fit"
              value={settings.single.fit}
              onChange={(fit: ImageSettings['single']['fit']) => patch({ single: { ...settings.single, fit } })}
              options={[
                { value: 'contain', label: 'Fit inside' },
                { value: 'cover', label: 'Crop to fill' },
              ]}
            />
            <span className="text-xs text-muted">
              {settings.single.fit === 'cover'
                ? 'Fills the width and height exactly, cutting from the centre. Needs both.'
                : 'Shrinks to fit inside the width and height, keeping the shape.'}{' '}
              Never enlarged. Turn off the formats you do not need to get a single file.
            </span>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium">
              Widths
              <input
                type="text"
                defaultValue={settings.widths.join(', ')}
                onBlur={(e) => patch({ widths: parseWidths(e.target.value) })}
                className="field"
              />
              <span className="mt-1 block text-xs font-normal text-muted">
                Widths larger than an image are dropped. Nothing is ever upscaled.
              </span>
            </label>

            <label className="block text-sm font-medium">
              <code className="font-mono text-xs">sizes</code> attribute
              <input
                type="text"
                defaultValue={settings.sizes}
                onBlur={(e) => patch({ sizes: e.target.value })}
                className="field"
              />
            </label>
          </>
        )}

        <div>
          <Toggle
            label="Remove EXIF and other metadata"
            hint="Colour profiles are always kept, and rotation is applied first."
            checked={settings.stripMetadata}
            onChange={(on) => patch({ stripMetadata: on })}
          />
          <Toggle
            label="Generate blurred placeholders"
            checked={settings.thumbhash}
            onChange={(on) => patch({ thumbhash: on })}
          />
          <Toggle
            label={
              <>
                Add <code className="font-mono text-xs">loading="lazy"</code> to the snippet
              </>
            }
            name='Add loading="lazy" to the snippet'
            checked={settings.lazy}
            onChange={(on) => patch({ lazy: on })}
          />
        </div>
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
    <div className="grid gap-x-8 gap-y-4 p-5 @2xl:grid-cols-2">
      <div>
        <p className="eyebrow mb-2">What to keep</p>
        <fieldset className="grid gap-2" aria-label="What to keep">
          {MODES.map((mode) => (
            <label
              key={mode.value}
              className={`relative flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-300 ${
                settings.mode === mode.value
                  ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] font-medium'
                  : 'border-rule hover:border-[color-mix(in_srgb,var(--color-ink)_30%,transparent)]'
              }`}
            >
              <input
                type="radio"
                name="subset-mode"
                checked={settings.mode === mode.value}
                onChange={() => patch({ mode: mode.value })}
                className="size-4 accent-[var(--color-accent)]"
              />
              {mode.label}
            </label>
          ))}
        </fieldset>
        {active && (
          <p key={active.value} className="rise mt-3 text-xs leading-relaxed text-muted">
            {active.note}
          </p>
        )}
      </div>

      <div className="grid content-start gap-3">
        {settings.mode === 'used' && (
          <label className="rise block text-sm font-medium">
            Text to keep, on top of any HTML or CSS you dropped in
            <textarea
              rows={3}
              defaultValue={settings.extraText}
              onBlur={(e) => patch({ extraText: e.target.value })}
              className="field"
              placeholder="Paste any wording that is not in the files above"
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              Letters, digits and punctuation are always kept, whatever you paste.
            </span>
          </label>
        )}

        <div className="text-sm font-medium">
          <code className="font-mono text-xs">font-display</code>
          <div className="mt-2">
            <Segmented
              name="font-display"
              label="font-display"
              value={settings.display}
              onChange={(display) => patch({ display })}
              options={(['swap', 'optional', 'fallback', 'block', 'auto'] as const).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </div>
        </div>

        <Toggle
          label="Add a preload tag for the first file"
          checked={settings.preload}
          onChange={(on) => patch({ preload: on })}
        />
        <Toggle
          label="Also write WOFF for older browsers"
          hint="WOFF2 covers every browser since 2018. Safari 11 and older need WOFF; the snippet lists it second, so newer browsers never download it."
          checked={settings.woff}
          onChange={(on) => patch({ woff: on })}
        />
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
    <div className="grid gap-x-8 gap-y-4 p-5 @2xl:grid-cols-2">
      <div>
        {TEXT_TOGGLES.map(({ key, label }) => (
          <Toggle
            key={key}
            label={label}
            checked={settings[key] as boolean}
            onChange={(on) => patch({ [key]: on } as Partial<TextSettings>)}
          />
        ))}
      </div>

      <div className="grid content-start gap-4">
        <div className="text-sm font-medium">
          Browsers to support
          <div className="mt-2">
            <Segmented
              name="target"
              label="Browsers to support"
              value={settings.target}
              onChange={(target: TargetPreset) => patch({ target })}
              options={Object.entries(TARGETS).map(([value, { label }]) => ({
                value: value as TargetPreset,
                label,
              }))}
            />
          </div>
          <span className="mt-1.5 block text-xs font-normal text-muted">
            {TARGET_NOTE[settings.target]} Newer code in your files is rewritten for these
            browsers, never the other way round.
          </span>
        </div>

        <div className="text-sm font-medium">
          JavaScript minification
          <div className="mt-2">
            <Segmented
              name="js-level"
              label="JavaScript minification"
              value={settings.jsLevel}
              onChange={(jsLevel: JsLevel) => patch({ jsLevel })}
              options={(Object.keys(JS_LEVELS) as JsLevel[]).map((value) => ({
                value,
                label: JS_LEVELS[value].label,
              }))}
            />
          </div>
          <span key={settings.jsLevel} className="rise mt-1.5 block text-xs leading-relaxed font-normal text-muted">
            {JS_LEVELS[settings.jsLevel].note}
          </span>
        </div>

        <div>
          <Toggle
            label="Write source maps"
            hint="A .map file beside each CSS and JS file, holding your original code. Dev tools show the code as you wrote it, and the original can always be recovered from the map. Visitors never download it."
            checked={settings.sourceMaps}
            onChange={(on) => patch({ sourceMaps: on })}
          />
          <Toggle
            label={
              <>
                Also write <code className="font-mono text-xs">.gz</code> copies
              </>
            }
            name="Also write .gz copies"
            checked={settings.gzip}
            onChange={(on) => patch({ gzip: on })}
          />
          <Toggle
            label={
              <>
                Also write <code className="font-mono text-xs">.br</code> copies
              </>
            }
            name="Also write .br copies"
            hint="Downloads a 200 KB compressor the first time."
            checked={settings.brotli}
            onChange={(on) => patch({ brotli: on })}
          />
        </div>
      </div>
    </div>
  );
}

/** What each browser range means, in words a site owner can check against. */
const TARGET_NOTE: Record<TargetPreset, string> = {
  modern: 'Chrome and Edge 111, Firefox 113, Safari 16.4 and newer — browsers from 2023 on.',
  wide: 'Chrome and Edge 90, Firefox 88, Safari 14 and newer — almost every browser in use.',
  legacy: 'Chrome 61, Firefox 60, Safari 11 and newer — phones and laptops back to 2017.',
};

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

/** Which sections to show, and one dropped image to price the quality sliders on. */
export type Present = { image: boolean; font: boolean; text: boolean; sample?: Asset };

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
    <fieldset disabled={disabled} className="grid gap-4">
      {present.image && (
        <Section title="Images" icon="image" index={1}>
          <ImageControls
            settings={settings.image}
            sample={present.sample}
            disabled={disabled}
            onChange={(image) => onChange({ ...settings, image })}
          />
        </Section>
      )}

      {present.font && (
        <Section title="Fonts" icon="type" index={2}>
          <FontControls
            settings={settings.font}
            onChange={(font) => onChange({ ...settings, font })}
          />
        </Section>
      )}

      {present.text && (
        <Section title="CSS, JavaScript, HTML and SVG" icon="code" index={3}>
          <TextControls
            settings={settings.text}
            onChange={(text) =>
              onChange({
                ...settings,
                text,
                // Choosing the 2017 range is a request for those browsers, and
                // they need WOFF fonts as well as older CSS and JavaScript.
                font:
                  text.target === 'legacy' && settings.text.target !== 'legacy'
                    ? { ...settings.font, woff: true }
                    : settings.font,
              })
            }
          />
          <p className="flex gap-2 border-t border-rule px-5 py-3 text-xs text-muted">
            <Icon name="shield" size={14} className="mt-px flex-none text-saved" />
            Minifying rewrites; it never removes. No CSS rule, no element, no attribute and no
            JavaScript export is deleted, so nothing that worked before can stop working.
          </p>
        </Section>
      )}
    </fieldset>
  );
}
