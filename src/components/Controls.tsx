import { DEFAULT_WIDTHS, FORMAT_LABEL, type ImageSettings, type OutputFormat } from '../lib/settings';

/**
 * Every switch in AGENTS.md's definition of done lives here. Nothing the pipeline
 * does is unconditional, and nothing is hidden behind an "advanced" disclosure -
 * a user who cannot see a toggle cannot trust it is off.
 */

const FORMATS: OutputFormat[] = ['avif', 'webp', 'fallback'];

function parseWidths(text: string): number[] {
  const parsed = text
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_WIDTHS;
}

type Props = {
  settings: ImageSettings;
  onChange: (next: ImageSettings) => void;
  disabled: boolean;
};

export function Controls({ settings, onChange, disabled }: Props) {
  const patch = (p: Partial<ImageSettings>) => onChange({ ...settings, ...p });

  return (
    <section className="mt-10 border border-rule" aria-label="Output settings">
      <h2 className="border-b border-rule px-5 py-3 text-sm tracking-wide text-muted uppercase">
        Output
      </h2>

      <fieldset disabled={disabled} className="grid gap-6 p-5 md:grid-cols-2">
        <div>
          <legend className="sr-only">Formats and quality</legend>
          {FORMATS.map((format) => (
            <div key={format} className="mb-4 last:mb-0">
              <label className="flex items-center gap-2 text-sm">
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
                    patch({
                      quality: { ...settings.quality, [format]: Number(e.target.value) },
                    })
                  }
                  className="w-40 accent-ink disabled:opacity-30"
                />
                <span className="tnum text-xs text-muted">
                  quality {settings.quality[format]}
                </span>
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
              className="mt-1 w-full border border-rule bg-white px-2 py-1 font-mono text-xs"
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
              className="mt-1 w-full border border-rule bg-white px-2 py-1 font-mono text-xs"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.stripMetadata}
              onChange={(e) => patch({ stripMetadata: e.target.checked })}
            />
            Remove EXIF and other metadata
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.thumbhash}
              onChange={(e) => patch({ thumbhash: e.target.checked })}
            />
            Generate blurred placeholders
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.lazy}
              onChange={(e) => patch({ lazy: e.target.checked })}
            />
            Add <code className="font-mono text-xs">loading="lazy"</code> to the snippet
          </label>
        </div>
      </fieldset>

      <p className="border-t border-rule px-5 py-3 text-xs text-muted">
        Colour profiles are always kept. Rotation stored in EXIF is applied to the
        pixels before the metadata is dropped, so nothing turns sideways.
      </p>
    </section>
  );
}
