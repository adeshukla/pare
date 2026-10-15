import type { ReactNode } from 'react';
import { t } from '../i18n';
import { Icon, type IconName } from './Visuals';

/**
 * What a first-time visitor sees under the drop zone: four tiles, each with a
 * small looping animation of what that part of Pare does. Illustrations, not
 * results - no numbers appear in them (Law 5).
 */

function Tile({
  icon,
  title,
  children,
  art,
  index,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  art: ReactNode;
  index: number;
}) {
  return (
    <article
      className="card rise group overflow-hidden transition-transform duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-1"
      style={{ ['--i' as string]: index + 2 }}
    >
      <div className="relative h-28 overflow-hidden border-b border-rule bg-raised" aria-hidden="true">
        {art}
      </div>
      <div className="p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="grid size-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-accent">
            <Icon name={icon} size={15} />
          </span>
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </article>
  );
}

/** A picture paring itself down while its formats line up. */
function ImageArt() {
  return (
    <div className="absolute inset-0 flex items-center gap-4 px-6">
      <div className="h-16 flex-1 overflow-hidden rounded-lg bg-rule">
        <div
          className="h-full rounded-lg"
          style={{
            background: 'linear-gradient(135deg,#f59e0b,#ef4444 45%,#8b5cf6)',
            ['--to' as string]: '22%',
            animation: 'pare 4.5s var(--ease-out-expo) infinite',
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {['AVIF', 'WebP', 'JPG'].map((f, i) => (
          <span key={f} className="chip float-tile font-mono text-[10px]" style={{ ['--i' as string]: i }}>
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One font fanning out into the scripts it covers. */
function FontArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-5">
      <span className="font-serif text-5xl font-semibold transition-transform duration-500 group-hover:scale-110">Aa</span>
      <div className="flex flex-col gap-1.5">
        {['latin', 'cyrillic', 'greek'].map((s, i) => (
          <span
            key={s}
            className="chip float-tile text-[10px]"
            style={{ ['--i' as string]: i, ['--r' as string]: i % 2 ? '2deg' : '-2deg' }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Three lines of code squeezing into one. */
function CodeArt() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 px-6 font-mono text-[11px] text-muted">
      <span style={{ animation: 'squash 4.5s var(--ease-out-expo) infinite' }}>.card {'{'} padding: 24px; {'}'}</span>
      <span style={{ animation: 'squash 4.5s var(--ease-out-expo) 0.15s infinite' }}>
        <span className="text-accent">function</span> show(i) {'{'} … {'}'}
      </span>
      <span style={{ animation: 'squash 4.5s var(--ease-out-expo) 0.3s infinite' }}>&lt;img src="hero.jpg"&gt;</span>
    </div>
  );
}

/** Pages being checked at three widths. */
function SiteArt() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 pb-4">
      {[
        ['w-7', 'h-14'],
        ['w-12', 'h-16'],
        ['w-20', 'h-[4.5rem]'],
      ].map(([w, h], i) => (
        <div key={i} className={`relative ${w} ${h} overflow-hidden rounded-md border border-rule bg-surface`}>
          <div className="m-1.5 h-1.5 rounded bg-rule" />
          <div className="mx-1.5 h-4 rounded bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)]" />
          <div
            className="absolute inset-x-0 top-0 h-4"
            style={{
              background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-saved) 45%, transparent))',
              animation: `scan 2.6s ease-in-out ${i * 0.35}s infinite`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

const TILES = [
  ['image', <ImageArt key="a" />],
  ['type', <FontArt key="a" />],
  ['code', <CodeArt key="a" />],
  ['layers', <SiteArt key="a" />],
] as const;

export function Features() {
  return (
    <section aria-labelledby="what-pare-does" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <h2 id="what-pare-does" className="sr-only">
        {t.whatPareDoes}
      </h2>
      {TILES.map(([icon, art], i) => (
        <Tile key={icon} icon={icon} title={t.features[i]![0]} art={art} index={i}>
          {t.features[i]![1]}
        </Tile>
      ))}
    </section>
  );
}

export function Steps() {
  const steps = t.steps;
  return (
    <ol className="mt-14 grid gap-6 sm:grid-cols-3">
      {steps.map(([title, text], i) => (
        <li key={title} className="rise flex gap-4" style={{ ['--i' as string]: i + 6 }}>
          <span className="grid size-9 flex-none place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-accent-ink shadow-lg shadow-accent/25">
            {i + 1}
          </span>
          <span>
            <span className="block font-semibold">{title}</span>
            <span className="text-sm text-muted">{text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
