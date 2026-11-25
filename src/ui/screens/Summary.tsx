import type { ScenarioInputs, ScenarioResult } from '../../engine/model';
import { OPTION_LABELS } from '../../engine/survivor';
import { k, monthly, pct, years, ym } from '../format';
import { Disclaimer } from '../Disclaimer';

export function Summary({ inputs, result }: { inputs: ScenarioInputs; result: ScenarioResult }) {
  const p = result.pension;
  const a = inputs.assumptions;
  return (
    <div className="stack summary">
      <div className="no-print">
        <button type="button" className="button" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <h2>Retirement estimate summary</h2>
      <p className="hint">Every number here is an estimate. Prepared {ym(inputs.today)}.</p>
      <table className="summary-table">
        <tbody>
          <tr><th scope="row">Retirement</th><td>{ym(p.retirementDate)}, age {Math.floor(p.ageAtRetirement)}</td></tr>
          <tr><th scope="row">Service credit</th><td>{years(p.service.creditedMonths)} ({years(p.service.actualMonths)} actual, {years(p.service.sickLeaveMonths)} sick leave, {years(p.service.stressMonths)} stress credit)</td></tr>
          <tr><th scope="row">Average final salary</th><td>{k(p.maximum.afs)}</td></tr>
          <tr><th scope="row">Maximum monthly benefit</th><td>{monthly(p.maximum.monthly)}</td></tr>
          <tr><th scope="row">Chosen option</th><td>{OPTION_LABELS[inputs.survivor.option]}: {monthly(p.chosen.retireeMonthly)} ({p.chosen.basis === 'letter' ? 'from RSA letter' : 'estimate'})</td></tr>
          <tr><th scope="row">PLOP</th><td>{p.plop.lumpSum > 0 ? `${k(p.plop.lumpSum)} lump sum, ${monthly(p.plop.monthlyReduction)} less per month` : 'None'}</td></tr>
          <tr><th scope="row">Pension after option and PLOP</th><td>{monthly(p.finalMonthly)} a month ({k(p.finalMonthly * 12)} a year)</td></tr>
          <tr><th scope="row">Survivor pension</th><td>{p.survivorMonthly > 0 ? `${monthly(p.survivorMonthly)} a month` : 'None'}</td></tr>
          <tr><th scope="row">Sick leave</th><td>{inputs.sickLeave.choice === 'cash' ? `Cash, about ${k(p.sickLeave.cashAfterTax)} after tax` : `${p.sickLeaveMonthsCredited} months of service credit`}</td></tr>
          <tr><th scope="row">Chance savings last to {a.longevityAge}</th><td>{pct(result.monteCarlo.successRate, 0)}</td></tr>
          <tr><th scope="row">Sustainable core spending</th><td>{k(result.sustainable)} a year (today's dollars)</td></tr>
          <tr><th scope="row">Assumptions</th><td>Inflation {pct(a.inflation)}; stocks {pct(a.returns.stocks.mean)}, bonds {pct(a.returns.bonds.mean)}; pension COLA {pct(a.pensionCola)}; pay COLA {pct(inputs.pay.scheduleColaPct)}</td></tr>
        </tbody>
      </table>
      <Disclaimer />
    </div>
  );
}
