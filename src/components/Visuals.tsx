import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Asset } from '../lib/types';

/**
 * The small visual vocabulary the rest of the UI is built from. Everything here
 * is decoration or feedback: no number Pare reports is produced in this file,
 * only animated towards (ADR-025, Law 5).
 */

/* ------------------------------------------------------------------ *
 * Icons - inline, 24px grid, stroke 2. No icon library for a dozen glyphs.
 * ------------------------------------------------------------------ */

const PATHS = {
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01',
  type: 'M5 7V5h14v2M12 5v14m-3 0h6',
  code: 'm8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8m-4-4v4',
  check: 'm5 12 5 5 9-10',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M4 20h16',
  share: 'M12 15V3m0 0L7 8m5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  refresh: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15m0 5v-5h5',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z',
  offline: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  layers: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Brand
 * ------------------------------------------------------------------ */

/** The mark: a rounded square with a "p" whose bowl is shaved open. */
export function Logo() {
  return (
    <span className="group inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-[-8deg]">
        <defs>
          <linearGradient id="pare-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-accent-2)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#pare-mark)" />
        <path
          d="M10 24V9h6.5a5 5 0 0 1 0 10H13"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">pare</span>
    </span>
  );
}

/**
 * Soft colour drifting behind everything. Fixed, decorative, blurred - and
 * still under prefers-reduced-motion.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-25 blur-3xl dark:opacity-20"
        style={{
          background: 'radial-gradient(closest-side, var(--color-accent), transparent)',
          animation: 'drift 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute top-20 -right-40 h-[420px] w-[520px] rounded-full opacity-20 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, var(--color-accent-2), transparent)',
          animation: 'drift 28s ease-in-out infinite reverse',
        }}
      />
      <div
        className="absolute top-[40%] -left-40 h-[380px] w-[480px] rounded-full opacity-15 blur-3xl"
        style={{
          background: 'radial-gradient(closest-side, var(--color-saved), transparent)',
          animation: 'drift 34s ease-in-out infinite',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-muted) 35%, transparent) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'linear-gradient(to bottom, black, transparent 70%)',
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

type Theme = 'system' | 'light' | 'dark';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON: Record<Theme, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

function storedTheme(): Theme {
  try {
    const t = localStorage.getItem('pare:theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Cycles system, light, dark. index.html applies the choice before first paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === 'system') localStorage.removeItem('pare:theme');
      else localStorage.setItem('pare:theme', next);
    } catch {
      // The choice still applies for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={() => choose(NEXT[theme])}
      className="btn btn-ghost btn-sm"
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}`}
      title={`Theme: ${theme}`}
    >
      <span key={theme} className="pop inline-flex">
        <Icon name={THEME_ICON[theme]} size={16} />
      </span>
      <span className="hidden capitalize sm:inline">{theme}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Motion helpers
 * ------------------------------------------------------------------ */

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number easing from `from` to `to`. Display only: the value Pare reports is
 * `to`, which is also what assistive technology is given (see Ticker).
 */
export function useTween(to: number, from: number, duration = 1100): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, duration]);
  return reducedMotion() ? to : value;
}

/**
 * Counts from `from` to `to`, formatted by `format`. The final text is in the
 * DOM for screen readers and tests from the first frame; the moving digits are
 * a visual layer over it.
 */
export function Ticker({ to, from, format }: { to: number; from: number; format: (n: number) => string }) {
  const value = useTween(to, from);
  const final = format(to);
  return (
    <span className="relative inline-block">
      <span className="invisible">{final}</span>
      <span aria-hidden="true" className="absolute inset-0 whitespace-nowrap">
        {format(value)}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/** A ring of dots thrown outward once, for a saving worth celebrating. */
export function Burst({ colors = ['var(--color-saved)', 'var(--color-accent)', 'var(--color-accent-2)'] }: { colors?: string[] }) {
  if (reducedMotion()) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const distance = 34 + (i % 3) * 12;
        return (
          <i
            key={i}
            className="absolute block size-1.5 rounded-full"
            style={{
              background: colors[i % colors.length],
              ['--dx' as string]: `${Math.cos(angle) * distance}px`,
              ['--dy' as string]: `${Math.sin(angle) * distance}px`,
              animation: `burst 0.9s var(--ease-out-expo) ${0.6 + (i % 4) * 0.03}s both`,
            }}
          />
        );
      })}
    </span>
  );
}

/** A tick that draws itself. */
export function DrawnCheck({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="14" fill="var(--color-saved)" className="pop" />
      <path
        d="m8.5 14.5 3.8 3.8 7.4-8"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset="24"
        style={{ animation: 'draw 0.5s var(--ease-out-expo) 0.25s forwards' }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

const KIND_COLOR: Record<string, string> = {
  image: 'linear-gradient(135deg,#f59e0b,#ef4444)',
  font: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
  css: 'linear-gradient(135deg,#8b5cf6,#6366f1)',
  js: 'linear-gradient(135deg,#eab308,#f59e0b)',
  html: 'linear-gradient(135deg,#f97316,#e11d48)',
  svg: 'linear-gradient(135deg,#10b981,#14b8a6)',
  other: 'linear-gradient(135deg,#71717a,#52525b)',
};

const extension = (path: string) => {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '?' : path.slice(dot + 1, dot + 6);
};

/**
 * What a file looks like in a list: the picture itself for an image, "Aa" set
 * in the font itself for a font, a coloured type badge for anything else.
 */
export function FileThumb({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string>();
  const [family, setFamily] = useState<string>();
  const failed = useRef(false);

  useEffect(() => {
    if (asset.kind !== 'image' || asset.mime === 'image/svg+xml') return;
    const made = URL.createObjectURL(new Blob([asset.bytes as BufferSource], { type: asset.mime }));
    // The URL is the external resource this effect owns; state carries it to render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [asset]);

  useEffect(() => {
    if (asset.kind !== 'font' || typeof FontFace === 'undefined') return;
    const name = 'pare-preview-' + Math.random().toString(36).slice(2);
    const face = new FontFace(name, asset.bytes.slice().buffer as ArrayBuffer);
    let live = true;
    face
      .load()
      .then((loaded) => {
        if (!live) return;
        document.fonts.add(loaded);
        setFamily(name);
      })
      .catch(() => {
        failed.current = true;
      });
    return () => {
      live = false;
      document.fonts.delete(face);
    };
  }, [asset]);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="size-10 flex-none rounded-[10px] border border-rule object-cover"
        loading="lazy"
      />
    );
  }
  if (family) {
    return (
      <span
        aria-hidden="true"
        className="grid size-10 flex-none place-items-center rounded-[10px] border border-rule bg-raised text-lg"
        style={{ fontFamily: family }}
      >
        Aa
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="badge flex-none" style={{ background: KIND_COLOR[asset.kind] ?? KIND_COLOR.other }}>
      {extension(asset.path)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/** A radio group drawn as a segmented control with a sliding thumb. */
export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="seg"
      style={{ ['--i' as string]: index, ['--n' as string]: options.length }}
    >
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            checked={o.value === value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

/** One short confirmation at a time, bottom centre. Announced politely. */
export function Toast({ toast }: { toast?: { id: number; text: string } }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      {toast && (
        <div
          key={toast.id}
          className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium whitespace-nowrap text-paper shadow-2xl"
          style={{ animation: 'toast-in 0.45s var(--ease-spring) both' }}
        >
          <Icon name="check" size={16} />
          {toast.text}
        </div>
      )}
    </div>
  );
}
