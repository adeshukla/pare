import { useEffect, useMemo, useState } from 'react';
import { bytes } from '../lib/format';
import { FORMAT_LABEL } from '../lib/settings';
import { Segmented } from './Visuals';
import type { ImageOutcome } from '../lib/types';

/**
 * The original and an encoded version, stacked, with a divider to drag between
 * them. A percentage says the file is smaller; this lets the user see what it
 * cost to get there, at full size if they want to look for artefacts.
 *
 * Only full-width variants are offered: comparing a 400px thumbnail with the
 * original would show the resize, not the encoder.
 */
export function Compare({
  original,
  mime,
  outcome,
}: {
  original: Uint8Array;
  mime: string;
  outcome: ImageOutcome;
}) {
  const full = useMemo(
    () => outcome.variants.filter((v) => v.width === outcome.naturalWidth),
    [outcome],
  );
  const [pick, setPick] = useState(0);
  const [split, setSplit] = useState(50);
  const [actual, setActual] = useState(false);
  /** The variant path this browser could not display, if any. */
  const [undisplayable, setUndisplayable] = useState<string>();

  const variant = full[Math.min(pick, full.length - 1)];

  // Made and revoked in the same effect: a URL minted in render and revoked in
  // a cleanup dies under StrictMode's mount-unmount-mount, leaving blank images.
  const [urls, setUrls] = useState<{ before: string; after: string }>();
  useEffect(() => {
    if (!variant) return;
    const made = {
      before: URL.createObjectURL(new Blob([original as BufferSource], { type: mime })),
      after: URL.createObjectURL(new Blob([variant.bytes as BufferSource], { type: variant.mime })),
    };
    // The URLs are the external system being synchronised with; state is how
    // the render learns them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(made);
    return () => {
      URL.revokeObjectURL(made.before);
      URL.revokeObjectURL(made.after);
    };
  }, [original, mime, variant]);

  if (!variant || !urls) return null;

  const size = actual
    ? { width: outcome.naturalWidth, height: outcome.naturalHeight }
    : { width: '100%', height: 'auto' };

  // Dragging anywhere on the picture moves the divider; the range below is the
  // keyboard and screen-reader path to the same value.
  const dragTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setSplit(Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))));
  };

  const label = (v: typeof variant) =>
    FORMAT_LABEL[v.format];

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-medium text-muted">Compare the original with</span>
        <Segmented
          name={'compare-' + outcome.inputPath}
          label="Version to compare"
          value={String(Math.min(pick, full.length - 1))}
          onChange={(v) => setPick(Number(v))}
          options={full.map((v, i) => ({ value: String(i), label: label(v) }))}
        />
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-muted">
          Actual size
          <input
            type="checkbox"
            className="switch"
            checked={actual}
            onChange={(e) => setActual(e.target.checked)}
          />
        </label>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-rule bg-[repeating-conic-gradient(var(--color-raised)_0_25%,var(--color-surface)_0_50%)] bg-[length:16px_16px]">
        <div
          className="relative cursor-ew-resize touch-none select-none"
          style={{ width: size.width }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragTo(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) dragTo(e);
          }}
        >
          <img src={urls.before} alt="Original" style={size} className="block max-w-none" draggable={false} />
          <img
            src={urls.after}
            alt={'Encoded as ' + variant.format}
            style={{ ...size, clipPath: `inset(0 0 0 ${split}%)` }}
            className="absolute inset-0 block max-w-none"
            draggable={false}
            onError={() => setUndisplayable(variant.path)}
          />
          {undisplayable === variant.path && (
            <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-3 py-2 text-xs text-paper">
              This browser cannot display {FORMAT_LABEL[variant.format]}, so it cannot be shown
              here. The file is fine: a browser that cannot read it takes the next format in
              the &lt;picture&gt;.
            </p>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
            style={{ left: split + '%' }}
          >
            <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-zinc-900 shadow-lg ring-1 ring-black/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6-6 6 6 6M15 6l6 6-6 6" />
              </svg>
            </span>
          </div>
          <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            Original · {bytes(original.byteLength)}
          </span>
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            {variant.format === 'fallback' ? 'Re-encoded' : FORMAT_LABEL[variant.format]} ·{' '}
            {bytes(variant.bytes.byteLength)}
          </span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Slide to compare the original (left) with the encoded version (right)"
        className="range mt-2"
        style={{ ['--fill' as string]: split }}
      />
    </figure>
  );
}
