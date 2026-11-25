import { useMemo } from 'react';
import { comparisons, type ScenarioInputs } from '../../engine/model';
import { KeyNumber, Note, Section, Table } from '../components';
import { k, monthly, pct, ym } from '../format';

/** Differences are small next to the totals, so show them to the nearest $100. */
const about = (v: number) => `$${(Math.round(Math.abs(v) / 100) * 100).toLocaleString()}`;
const signed = (v: number) => (Math.abs(v) < 50 ? 'about the same' : `${v > 0 ? '+' : '−'}${about(v)}/yr`);

export function Compare({ inputs }: { inputs: ScenarioInputs }) {
  const list = useMemo(() => comparisons(inputs, 300), [inputs]);
  const plopTitle = 'PLOP vs. no PLOP';
  return (
    <div className="stack">
      <Note>
        Sustainable spending is the most you could spend each year, in today&apos;s dollars, without running out of savings by your plan age. Every comparison
        starts from your current plan, so the options often land within a few thousand dollars of each other. The difference column shows the gap to the nearest
        $100.
      </Note>
      <Note>
        Each comparison changes one thing and keeps everything else the same. Success rates use 300 market paths per option, so they can differ slightly from
        the Plan screen.
      </Note>
      {list.map((c) => {
        const ranked = [...c.variants].sort((a, b) => b.sustainable - a.sustainable);
        const best = ranked[0]!;
        const runnerUp = ranked[1];
        const lead = runnerUp ? best.sustainable - runnerUp.sustainable : 0;
        const base = c.variants[0]!;
        return (
          <Section key={c.title} title={c.title}>
            <div className="keys">
              <KeyNumber
                label="Best for spending"
                value={best.label}
                sub={
                  runnerUp
                    ? lead < 50
                      ? `${k(best.sustainable)}/yr, about the same as ${runnerUp.label}`
                      : `${k(best.sustainable)}/yr, about ${about(lead)} a year more than ${runnerUp.label}`
                    : `${k(best.sustainable)}/yr`
                }
              />
            </div>
            <Table
              caption={c.title}
              head={[
                'Option',
                'Retire',
                'Monthly pension',
                c.title === plopTitle ? 'Lump sum' : 'Note',
                'Sustainable spending',
                `Difference vs. ${base.label}`,
                'Success rate',
                'Median left at end',
              ]}
              rows={c.variants.map((v) => [
                v.label,
                ym(v.retirementDate),
                monthly(v.monthlyPension),
                c.title === plopTitle ? k(v.lumpSum) : (v.note ?? ''),
                `${k(v.sustainable)}/yr`,
                v === base ? '—' : signed(v.sustainable - base.sustainable),
                pct(v.successRate, 0),
                k(v.medianEnding),
              ])}
            />
            {c.breakdown && (
              <Table
                caption={`Why ${c.breakdown.to} differs from ${c.breakdown.from}, in sustainable spending a year (today's dollars, nearest $100)`}
                head={['Reason', 'Effect']}
                rows={[...c.breakdown.lines.map((l) => [l.label, signed(l.amount)]), ['Total', signed(c.breakdown.lines.reduce((a, l) => a + l.amount, 0))]]}
              />
            )}
          </Section>
        );
      })}
    </div>
  );
}
