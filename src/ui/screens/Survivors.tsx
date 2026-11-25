import { deathByYear, survivorView, type ScenarioInputs, type ScenarioResult } from '../../engine/model';
import { OPTION_LABELS } from '../../engine/survivor';
import { KeyNumber, Note, Section, Table } from '../components';
import { k, monthly } from '../format';

export function Survivors({ inputs, result }: { inputs: ScenarioInputs; result: ScenarioResult }) {
  const p = result.pension;
  const death = deathByYear(inputs, p);
  const rows = survivorView(inputs, p, death);
  const chosen = p.options.find((o) => o.option === inputs.survivor.option);
  return (
    <Section title="If you die first: what your beneficiary receives" who="beneficiary">
      <div className="stack">
        <div className="keys">
          <KeyNumber
            label="Beneficiary pension under your choice"
            value={chosen && chosen.survivorMonthly > 0 ? monthly(p.survivorMonthly) : '$0'}
            sub={`${OPTION_LABELS[inputs.survivor.option]}, per month for life`}
          />
          <KeyNumber
            label="If you die before eligibility"
            value={k(death.find((d) => !d.eligible)?.lumpSum ?? 0)}
            sub="One-time lump sum, no pension"
            tone="warn"
          />
        </div>
        <Note>
          Maximum and Option 1 pay no lifetime survivor benefit. Option 1 refunds any unused annuity savings. Spouse Social Security is the larger of your two
          benefits, a simplified survivor estimate. A surviving spouse can usually start it at 60.
        </Note>
        <p>
          Each row below is a case where <strong>you, the firefighter, die first</strong>. It shows what your RSA beneficiary would receive each month, any
          one-time payment, and, if your beneficiary is your spouse, Social Security. For deaths after retirement, what your beneficiary gets depends on the RSA
          option you pick when you retire, so each option has its own row. Your beneficiary is usually your spouse, but it doesn&apos;t have to be.
        </p>
        <Table
          caption="What your beneficiary receives if you die first (today's dollars)"
          head={[
            'If you die',
            'Your RSA option',
            'What your beneficiary gets',
            'RSA pension to beneficiary per month',
            'One-time payment to beneficiary',
            'Spouse Social Security per month (spouse only)',
          ]}
          rows={rows.map((r) => [
            r.scenario,
            r.option === 'maximum' && r.pensionMonthly === 0 && r.lumpSum > 0
              ? 'Any (not retired yet)'
              : r.scenario.includes('still working')
                ? 'Not retired yet'
                : OPTION_LABELS[r.option],
            r.explain,
            r.pensionMonthly > 0 ? monthly(r.pensionMonthly) : '$0',
            r.lumpSum > 0 ? k(r.lumpSum) : '\u2014',
            monthly(r.socialSecurityMonthly),
          ])}
        />
        <Note>Confirm surviving-spouse health coverage with the City of Huntsville benefits office, and survivor benefits with RSA.</Note>
      </div>
    </Section>
  );
}
