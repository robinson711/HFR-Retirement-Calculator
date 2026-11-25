import { useMemo } from 'react';
import { comparisons, type ScenarioInputs } from '../../engine/model';
import { KeyNumber, Note, Section, Table } from '../components';
import { k, monthly, pct, ym } from '../format';

export function Compare({ inputs }: { inputs: ScenarioInputs }) {
  const list = useMemo(() => comparisons(inputs, 300), [inputs]);
  const plopTitle = 'PLOP vs. no PLOP';
  return (
    <div className="stack">
      <Note>Each comparison changes one thing and keeps everything else the same. Success rates use 300 market paths per option, so they can differ slightly from the Plan screen.</Note>
      {list.map((c) => {
        const best = [...c.variants].sort((a, b) => b.sustainable - a.sustainable)[0]!;
        return (
          <Section key={c.title} title={c.title}>
            <div className="keys">
              <KeyNumber label="Highest sustainable spending" value={`${k(best.sustainable)}/yr`} sub={best.label} />
            </div>
            <Table
              caption={c.title}
              head={['Option', 'Retire', 'Monthly pension', c.title === plopTitle ? 'Lump sum' : 'Note', 'Sustainable spending', 'Success rate', 'Median left at end']}
              rows={c.variants.map((v) => [
                v.label,
                ym(v.retirementDate),
                monthly(v.monthlyPension),
                c.title === plopTitle ? k(v.lumpSum) : (v.note ?? ''),
                `${k(v.sustainable)}/yr`,
                pct(v.successRate, 0),
                k(v.medianEnding),
              ])}
            />
          </Section>
        );
      })}
    </div>
  );
}
