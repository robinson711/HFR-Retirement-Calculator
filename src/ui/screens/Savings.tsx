import type { Account, AccountKind } from '../../engine/cashflow';
import { PRESETS, type PresetName, type ScenarioInputs } from '../../engine/model';
import { MoneyField, Note, NumberField, PercentField, Section, SelectField, Toggle } from '../components';
import { k } from '../format';
import type { Setter } from './You';

const KIND_LABEL: Record<AccountKind, string> = { '457b': '457(b)', pretax: 'Pre-tax (TSP, IRA, 401(k))', taxable: 'Taxable brokerage', roth: 'Roth' };

export function Savings({ inputs, set, onPreset }: { inputs: ScenarioInputs; set: Setter; onPreset: (p: PresetName) => void }) {
  const setAcc = (id: string, update: (a: Account) => Account) => set((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? update(a) : a)) }));
  const total = inputs.accounts.reduce((s, a) => s + a.balance, 0);
  const a = inputs.assumptions;
  return (
    <div className="grid">
      <Section title="Savings accounts">
        <p className="lead">Total today: {k(total)}. Contributions continue until you retire.</p>
        {inputs.accounts.map((acc) => {
          const allocSum = acc.allocation.stocks + acc.allocation.bonds + acc.allocation.cash;
          return (
            <fieldset key={acc.id} className="account">
              <legend>{acc.label}</legend>
              <div className="row wrap">
                <SelectField label="Type" value={acc.kind} options={Object.entries(KIND_LABEL) as Array<[AccountKind, string]>} onChange={(kind) => setAcc(acc.id, (x) => ({ ...x, kind }))} />
                <SelectField label="Owner" value={acc.owner} options={[['member', 'You'], ['spouse', 'Spouse']]} onChange={(owner) => setAcc(acc.id, (x) => ({ ...x, owner }))} />
                <MoneyField label="Balance" value={acc.balance} step={1000} onChange={(balance) => setAcc(acc.id, (x) => ({ ...x, balance }))} />
                <MoneyField label="Yearly contribution" value={acc.contribution} onChange={(contribution) => setAcc(acc.id, (x) => ({ ...x, contribution }))} />
              </div>
              <div className="row wrap">
                <PercentField label="Stocks" value={acc.allocation.stocks} step={5} min={0} max={100} onChange={(stocks) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, stocks } }))} />
                <PercentField label="Bonds" value={acc.allocation.bonds} step={5} min={0} max={100} onChange={(bonds) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, bonds } }))} />
                <PercentField label="Cash" value={acc.allocation.cash} step={5} min={0} max={100} onChange={(cash) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, cash } }))} />
                {acc.kind === 'taxable' && (
                  <PercentField label="Cost basis share" value={acc.basisPct ?? 1} step={5} min={0} max={100} onChange={(basisPct) => setAcc(acc.id, (x) => ({ ...x, basisPct }))} />
                )}
              </div>
              {Math.abs(allocSum - 1) > 0.001 && <Note kind="warn">Stocks, bonds and cash add up to {Math.round(allocSum * 100)}%, not 100%.</Note>}
            </fieldset>
          );
        })}
        <SelectField
          label="Withdrawal order"
          value={inputs.withdrawalOrder.join(',')}
          options={[
            ['taxable,457b,pretax,roth', 'Taxable, then pre-tax, then Roth'],
            ['457b,pretax,taxable,roth', 'Pre-tax, then taxable, then Roth'],
            ['taxable,roth,457b,pretax', 'Taxable, then Roth, then pre-tax'],
          ]}
          onChange={(v) => set((s) => ({ ...s, withdrawalOrder: v.split(',') as AccountKind[] }))}
          hint="457(b) withdrawals after you leave the city have no 10% early withdrawal penalty. IRA withdrawals before 59½ usually do."
        />
      </Section>

      <Section title="Other income">
        <Toggle label="Second job after retirement" checked={inputs.secondJob.enabled} onChange={(enabled) => set((s) => ({ ...s, secondJob: { ...s.secondJob, enabled } }))} />
        {inputs.secondJob.enabled && (
          <>
            <MoneyField label="Pay per year (today's dollars)" value={inputs.secondJob.annual} step={1000} onChange={(annual) => set((s) => ({ ...s, secondJob: { ...s.secondJob, annual } }))} />
            <NumberField label="Work until age" value={inputs.secondJob.endAge} min={40} max={80} onChange={(endAge) => set((s) => ({ ...s, secondJob: { ...s.secondJob, endAge: Math.round(endAge) } }))} />
            <Toggle
              label="Employer participates in RSA (ERS or TRS)"
              checked={inputs.secondJob.rsaEmployer}
              onChange={(rsaEmployer) => set((s) => ({ ...s, secondJob: { ...s.secondJob, rsaEmployer } }))}
            />
            {inputs.secondJob.rsaEmployer && (
              <>
                <Toggle label="Full-time" checked={inputs.secondJob.fullTime} onChange={(fullTime) => set((s) => ({ ...s, secondJob: { ...s.secondJob, fullTime } }))} />
                <Note kind="warn">
                  Full-time work for any RSA participating employer suspends your pension. Part-time work is allowed only under RSA's yearly earnings limit (check
                  RSA's website for this year's figure) and after a 30-day break. Private-sector work has no limit.
                </Note>
              </>
            )}
          </>
        )}
        <h3>Social Security</h3>
        <div className="row wrap">
          <MoneyField
            label="Your monthly benefit (today's dollars)"
            value={inputs.socialSecurity.member?.monthly ?? 0}
            step={50}
            onChange={(monthly) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, member: monthly > 0 ? { claimAge: s.socialSecurity.member?.claimAge ?? 67, monthly } : null } }))}
          />
          <NumberField
            label="Your claiming age"
            value={inputs.socialSecurity.member?.claimAge ?? 67}
            min={62}
            max={70}
            onChange={(claimAge) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, member: s.socialSecurity.member ? { ...s.socialSecurity.member, claimAge: Math.round(claimAge) } : null } }))}
          />
          <MoneyField
            label="Spouse monthly benefit"
            value={inputs.socialSecurity.spouse?.monthly ?? 0}
            step={50}
            onChange={(monthly) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, spouse: monthly > 0 ? { claimAge: s.socialSecurity.spouse?.claimAge ?? 67, monthly } : null } }))}
          />
          <NumberField
            label="Spouse claiming age"
            value={inputs.socialSecurity.spouse?.claimAge ?? 67}
            min={62}
            max={70}
            onChange={(claimAge) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, spouse: s.socialSecurity.spouse ? { ...s.socialSecurity.spouse, claimAge: Math.round(claimAge) } : null } }))}
          />
        </div>
        <p className="hint">Use the estimate at your claiming age from ssa.gov/myaccount.</p>
      </Section>

      <Section title="Spending in retirement">
        <MoneyField label="Core spending per year (today's dollars)" value={inputs.expenses.core} step={1000} onChange={(core) => set((s) => ({ ...s, expenses: { ...s.expenses, core } }))} />
        <MoneyField label="Healthcare per year before 65" value={inputs.expenses.healthPre65} step={500} onChange={(healthPre65) => set((s) => ({ ...s, expenses: { ...s.expenses, healthPre65 } }))} />
        <MoneyField label="Healthcare per year after 65" value={inputs.expenses.healthPost65} step={500} onChange={(healthPost65) => set((s) => ({ ...s, expenses: { ...s.expenses, healthPost65 } }))} />
        <Note>Include retiree and surviving-spouse coverage. Confirm premiums and eligibility with the City of Huntsville benefits office.</Note>
        <MoneyField label="Mortgage payment per year" value={inputs.expenses.mortgageAnnual} step={500} onChange={(mortgageAnnual) => set((s) => ({ ...s, expenses: { ...s.expenses, mortgageAnnual } }))} />
        <NumberField label="Mortgage payoff year" value={inputs.expenses.mortgagePayoffYear} onChange={(y) => set((s) => ({ ...s, expenses: { ...s.expenses, mortgagePayoffYear: Math.round(y) } }))} />
      </Section>

      <Section title="Assumptions">
        <SelectField
          label="Preset"
          value={inputs.preset}
          options={[
            ['conservative', 'Conservative'],
            ['base', 'Base'],
            ['optimistic', 'Optimistic'],
          ]}
          onChange={onPreset}
          hint={`Base: stocks ${(PRESETS.base.returns.stocks.mean * 100).toFixed(1)}%, bonds ${(PRESETS.base.returns.bonds.mean * 100).toFixed(1)}%, inflation ${(PRESETS.base.inflation * 100).toFixed(1)}%. These are assumptions, not forecasts.`}
        />
        <PercentField label="Inflation" value={a.inflation} onChange={(inflation) => set((s) => ({ ...s, assumptions: { ...s.assumptions, inflation } }))} />
        {(['stocks', 'bonds', 'cash'] as const).map((cls) => (
          <div className="row" key={cls}>
            <PercentField
              label={`${cls[0]!.toUpperCase()}${cls.slice(1)} return`}
              value={a.returns[cls].mean}
              onChange={(mean) => set((s) => ({ ...s, assumptions: { ...s.assumptions, returns: { ...s.assumptions.returns, [cls]: { ...s.assumptions.returns[cls], mean } } } }))}
            />
            <PercentField
              label={`${cls[0]!.toUpperCase()}${cls.slice(1)} volatility`}
              value={a.returns[cls].volatility}
              onChange={(volatility) => set((s) => ({ ...s, assumptions: { ...s.assumptions, returns: { ...s.assumptions.returns, [cls]: { ...s.assumptions.returns[cls], volatility } } } }))}
            />
          </div>
        ))}
        <NumberField label="Plan to age" value={a.longevityAge} min={70} max={110} onChange={(longevityAge) => set((s) => ({ ...s, assumptions: { ...s.assumptions, longevityAge: Math.round(longevityAge) } }))} />
        <PercentField
          label="Retiree pension COLA"
          value={a.pensionCola}
          onChange={(pensionCola) => set((s) => ({ ...s, assumptions: { ...s.assumptions, pensionCola } }))}
          hint="Default 0%. Retiree COLAs are not guaranteed."
        />
      </Section>
    </div>
  );
}
