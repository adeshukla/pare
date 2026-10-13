import type { ReactNode } from 'react';
import { bytes, reduction } from '../lib/format';
import { REPORT_LABEL, type Report, type ReportKind } from '../lib/optimize';
import { SavingBars } from './FolderPanel';
import { Burst, Icon, Ticker } from './Visuals';

/**
 * The files-mode headline. Every figure here is from `summarise` (ADR-009);
 * the animation only moves towards it.
 */

const KIND_COLOR: Record<ReportKind, string> = {
  image: '#f97316',
  font: '#3b82f6',
  css: '#8b5cf6',
  js: '#eab308',
  html: '#e11d48',
  svg: '#10b981',
};

export function FilesSavings({ report, children }: { report: Report; children: ReactNode }) {
  const cut = reduction(report.bytesBefore, report.bytesServed);
  const total = report.lines.reduce((n, l) => n + l.served, 0) || 1;

  return (
    <section className="card rise mt-4 overflow-hidden" aria-label="Savings">
      <div className="p-6">
        <p className="eyebrow">What a visitor downloads</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="tnum text-muted">{bytes(report.bytesBefore)}</span>
          <span className="text-muted" aria-hidden="true">→</span>
          <span className="tnum">
            <Ticker from={report.bytesBefore} to={report.bytesServed} format={bytes} />
          </span>
          {cut > 0 && (
            <span className="relative">
              <span className="pill-saved pop px-3 py-1 text-base">{cut}% smaller</span>
              {cut >= 20 && <Burst />}
            </span>
          )}
        </p>

        <SavingBars before={report.bytesBefore} after={report.bytesServed} />

        <p className="mt-4 max-w-prose text-sm text-muted">
          For images the smallest full-size format their browser reads, for split fonts the first
          file only, for code the smallest compressed copy. The zip holds{' '}
          <span className="tnum">{bytes(report.bytesEmitted)}</span> across every variant — nobody
          downloads all of it.
        </p>
      </div>

      {report.lines.length > 1 && (
        <div className="border-t border-rule px-6 py-5">
          <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
            {report.lines.map((line, i) => (
              <span
                key={line.kind}
                style={{
                  width: `${(line.served / total) * 100}%`,
                  background: KIND_COLOR[line.kind],
                  animation: `grow-x 0.8s var(--ease-out-expo) ${0.2 + i * 0.08}s both`,
                  transformOrigin: 'left',
                }}
              />
            ))}
          </div>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {report.lines.map((line) => (
                <tr key={line.kind} className="border-t border-rule first:border-0">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <i className="size-2.5 rounded-full" style={{ background: KIND_COLOR[line.kind] }} aria-hidden="true" />
                      <span>{REPORT_LABEL[line.kind]}</span>
                    </span>
                  </td>
                  <td className="tnum py-2 pr-4 text-right text-muted">{line.count}</td>
                  <td className="tnum py-2 pr-4 text-right text-muted">{bytes(line.before)}</td>
                  <td className="tnum py-2 pr-4 text-right font-medium">{bytes(line.served)}</td>
                  <td className="tnum py-2 text-right">
                    {reduction(line.before, line.served) > 0 ? (
                      <span className="pill-saved">{reduction(line.before, line.served)}%</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.locationsRemoved > 0 && (
        <p className="flex items-center gap-2 border-t border-rule px-6 py-3 text-sm">
          <Icon name="shield" size={15} className="flex-none text-saved" />
          {report.locationsRemoved === 1
            ? 'One photo held the place it was taken. That location is not in the file you download.'
            : `${report.locationsRemoved} photos held the place they were taken. Those locations are not in the files you download.`}
        </p>
      )}

      {report.skipped > 0 && (
        <p className="border-t border-rule px-6 py-3 text-sm text-warn">
          {report.skipped} file{report.skipped === 1 ? ' was' : 's were'} left unchanged. The reason
          is on the row.
        </p>
      )}

      <div className="border-t border-rule bg-raised/50 px-6 py-4">{children}</div>
    </section>
  );
}
