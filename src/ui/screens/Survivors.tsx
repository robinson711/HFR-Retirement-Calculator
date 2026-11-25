import { deathByYear, survivorView, type ScenarioInputs, type ScenarioResult } from '../../engine/model';
import { OPTION_LABELS } from '../../engine/survivor';
import { KeyNumber, Note, Table } from '../components';
import { k, monthly } from '../format';

export function Survivors({ inputs, result }: { inputs: ScenarioInputs; result: ScenarioResult }) {
  const p = result.pension;
  const death = deathByYear(inputs, p);
  const rows = survivorView(inputs, p, death);
  const chosen = p.options.find((o) => o.option === inputs.survivor.option);
  return (
    <div className="stack">
      <div className="keys">
        <KeyNumber label="Spouse pension under your choice" value={chosen && chosen.survivorMonthly > 0 ? monthly(p.survivorMonthly) : '$0'} sub={`${OPTION_LABELS[inputs.survivor.option]}, per month for life`} />
        <KeyNumber label="If you die before eligibility" value={k(death.find((d) => !d.eligible)?.lumpSum ?? 0)} sub="One-time lump sum, no pension" tone="warn" />
      </div>
      <Note>Maximum and Option 1 pay no lifetime survivor benefit. Option 1 refunds any unused annuity savings. Social Security shown is the larger of the two benefits, a simplified survivor estimate.</Note>
      <Table
        caption="Spouse income by scenario and option (today's dollars)"
        head={['Scenario', 'Option', 'Pension per month', 'Lump sum', 'Social Security per month']}
        rows={rows.map((r) => [r.scenario, OPTION_LABELS[r.option], r.pensionMonthly > 0 ? monthly(r.pensionMonthly) : '$0', r.lumpSum > 0 ? k(r.lumpSum) : '—', monthly(r.socialSecurityMonthly)])}
      />
      <Note>Confirm surviving-spouse health coverage with the City of Huntsville benefits office, and survivor benefits with RSA.</Note>
    </div>
  );
}
