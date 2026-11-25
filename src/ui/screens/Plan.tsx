import type { ScenarioInputs, ScenarioResult } from '../../engine/model';
import { BalanceChart, IncomeChart } from '../charts';
import { Assumptions, KeyNumber, Note, ShowMath, Table } from '../components';
import { k, pct } from '../format';

export function Plan({ inputs, result }: { inputs: ScenarioInputs; result: ScenarioResult }) {
  const { projection, monteCarlo: mc, sustainable } = result;
  const a = inputs.assumptions;
  const retiredRows = projection.rows.filter((r) => r.retired);
  const spendingNeed = inputs.expenses.core;
  const success = mc.successRate;
  const income = retiredRows.map((r) => ({
    age: r.memberAge,
    pension: r.pension,
    job: r.job,
    socialSecurity: r.socialSecurity,
    withdrawals: r.withdrawals.taxable + r.withdrawals['457b'] + r.withdrawals.roth457 + r.withdrawals.pretax + r.withdrawals.roth,
    shortfall: r.shortfall,
  }));
  const balances = mc.percentiles.map((p, i) => ({ ...p, expected: projection.rows[i]!.balance }));
  const suspended = projection.rows.some((r) => r.pensionSuspended);
  return (
    <div className="stack">
      <div className="keys">
        <KeyNumber
          label="Chance your savings last"
          value={pct(success, 0)}
          tone={success >= 0.85 ? 'good' : success >= 0.7 ? 'warn' : 'bad'}
          sub={`${mc.paths.toLocaleString()} market paths, spending ${k(spendingNeed)} a year to age ${a.longevityAge}`}
        />
        <KeyNumber label="Most you can spend" value={`${k(sustainable)}/yr`} sub="Flat core spending in today's dollars that lasts to your plan age, with average returns" />
        <KeyNumber label="Savings at retirement" value={k(projection.rows.find((r) => r.retired)?.balance ?? 0)} sub="Today's dollars, average returns" />
      </div>
      {suspended && <Note kind="warn">Your second job is full-time with an RSA employer, so your pension is suspended while you work there.</Note>}
      {!projection.success && <Note kind="warn">With average returns, savings run out in {projection.depletedYear}.</Note>}
      <Assumptions
        items={[
          ['Returns', `Stocks ${pct(a.returns.stocks.mean)} (volatility ${pct(a.returns.stocks.volatility)}), bonds ${pct(a.returns.bonds.mean)}, cash ${pct(a.returns.cash.mean)}`],
          ['Inflation', pct(a.inflation)],
          ['Pension COLA', `${pct(a.pensionCola)} (not guaranteed)`],
          ['Taxes', '2026 federal brackets and Alabama rules, indexed to inflation'],
          ['Withdrawal order', inputs.withdrawalOrder.join(' → ')],
        ]}
      />
      <IncomeChart data={income} />
      <BalanceChart data={balances} />
      <ShowMath>
        <p>
          Each year: income (pension, second job, Social Security) pays spending first. Withdrawals cover the rest plus taxes, in your withdrawal order. Extra income is
          saved to the taxable account. All figures are today's dollars.
        </p>
        <Table
          caption="Year-by-year cash flow (today's dollars)"
          head={['Year', 'Age', 'Pension', 'Job', 'Social Security', 'Withdrawals', 'Taxes', 'Spending', 'Balance']}
          rows={projection.rows.map((r) => [
            String(r.year),
            String(r.memberAge),
            k(r.pension),
            k(r.job),
            k(r.socialSecurity),
            k(r.withdrawals.taxable + r.withdrawals['457b'] + r.withdrawals.roth457 + r.withdrawals.pretax + r.withdrawals.roth),
            k(r.taxes),
            k(r.spending),
            k(r.balance),
          ])}
        />
      </ShowMath>
    </div>
  );
}
