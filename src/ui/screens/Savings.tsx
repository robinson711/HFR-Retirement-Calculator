import type { Account, AccountKind } from '../../engine/cashflow';
import {
  PRESETS,
  psoSavings,
  resolveSocialSecurity,
  type PresetName,
  type ScenarioInputs,
  type ScenarioResult,
  type SsDetail,
  type SsPerson,
} from '../../engine/model';
import { MoneyField, Note, NumberField, PercentField, Section, SelectField, ShowMath, Toggle, WhoBadge } from '../components';
import { dollars, k, monthly } from '../format';
import type { Setter } from './You';

const KIND_LABEL: Record<AccountKind, string> = {
  '457b': '457(b) traditional',
  roth457: '457(b) Roth',
  pretax: 'Pre-tax (TSP, IRA, 401(k))',
  taxable: 'Taxable brokerage',
  roth: 'Roth IRA',
};
const is457 = (a: Account) => a.owner === 'member' && (a.kind === '457b' || a.kind === 'roth457');

export function Savings({ inputs, result, set, onPreset }: { inputs: ScenarioInputs; result: ScenarioResult; set: Setter; onPreset: (p: PresetName) => void }) {
  const setAcc = (id: string, update: (a: Account) => Account) => set((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? update(a) : a)) }));
  const total = inputs.accounts.reduce((s, a) => s + (a.notHeld ? 0 : a.balance), 0);
  const a = inputs.assumptions;
  const ss = resolveSocialSecurity(inputs, result.pension);
  return (
    <div className="grid">
      <Section title="Savings accounts">
        <p className="lead">Total today: {k(total)}. Contributions continue until you retire.</p>
        <DeferredComp inputs={inputs} set={set} />
        {inputs.accounts
          .filter((acc) => !is457(acc))
          .map((acc) => {
            const allocSum = acc.allocation.stocks + acc.allocation.bonds + acc.allocation.cash;
            return (
              <fieldset key={acc.id} className={`account who-${acc.owner === 'spouse' ? 'spouse' : 'you'}`}>
                <legend>
                  <WhoBadge who={acc.owner === 'spouse' ? 'spouse' : 'you'} />
                  {acc.label}
                </legend>
                <Toggle label="I don't have this account" checked={!!acc.notHeld} onChange={(notHeld) => setAcc(acc.id, (x) => ({ ...x, notHeld }))} />
                {!acc.notHeld && (
                  <>
                    <div className="row wrap">
                      <SelectField
                        label="Type"
                        value={acc.kind}
                        options={Object.entries(KIND_LABEL) as Array<[AccountKind, string]>}
                        onChange={(kind) => setAcc(acc.id, (x) => ({ ...x, kind }))}
                      />
                      <SelectField
                        label="Owner"
                        value={acc.owner}
                        options={[
                          ['member', 'You'],
                          ['spouse', 'Spouse'],
                        ]}
                        onChange={(owner) => setAcc(acc.id, (x) => ({ ...x, owner }))}
                      />
                      <MoneyField label="Balance" value={acc.balance} step={1000} onChange={(balance) => setAcc(acc.id, (x) => ({ ...x, balance }))} />
                      <MoneyField
                        label="Yearly contribution"
                        value={acc.contribution}
                        onChange={(contribution) => setAcc(acc.id, (x) => ({ ...x, contribution }))}
                      />
                    </div>
                    <div className="row wrap">
                      <PercentField
                        label="Stocks"
                        value={acc.allocation.stocks}
                        step={5}
                        min={0}
                        max={100}
                        onChange={(stocks) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, stocks } }))}
                      />
                      <PercentField
                        label="Bonds"
                        value={acc.allocation.bonds}
                        step={5}
                        min={0}
                        max={100}
                        onChange={(bonds) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, bonds } }))}
                      />
                      <PercentField
                        label="Cash"
                        value={acc.allocation.cash}
                        step={5}
                        min={0}
                        max={100}
                        onChange={(cash) => setAcc(acc.id, (x) => ({ ...x, allocation: { ...x.allocation, cash } }))}
                      />
                      {acc.kind === 'taxable' && (
                        <PercentField
                          label="Cost basis share"
                          value={acc.basisPct ?? 1}
                          step={5}
                          min={0}
                          max={100}
                          onChange={(basisPct) => setAcc(acc.id, (x) => ({ ...x, basisPct }))}
                        />
                      )}
                    </div>
                    {Math.abs(allocSum - 1) > 0.001 && <Note kind="warn">Stocks, bonds and cash add up to {Math.round(allocSum * 100)}%, not 100%.</Note>}
                  </>
                )}
              </fieldset>
            );
          })}
        <SelectField
          label="Withdrawal order"
          value={orderValue(inputs.withdrawalOrder)}
          options={[
            ['taxable,457b,pretax,roth457,roth', 'Taxable, then pre-tax, then Roth'],
            ['457b,pretax,taxable,roth457,roth', 'Pre-tax, then taxable, then Roth'],
            ['taxable,roth457,roth,457b,pretax', 'Taxable, then Roth, then pre-tax'],
          ]}
          onChange={(v) => set((s) => ({ ...s, withdrawalOrder: v.split(',') as AccountKind[] }))}
          hint="457(b) withdrawals after you leave the city have no 10% early withdrawal penalty. IRA withdrawals before 59½ usually do."
        />
      </Section>

      <Section title="Other income">
        <Toggle
          label="Second job after retirement"
          checked={inputs.secondJob.enabled}
          onChange={(enabled) => set((s) => ({ ...s, secondJob: { ...s.secondJob, enabled } }))}
        />
        {inputs.secondJob.enabled && (
          <>
            <MoneyField
              label="Pay per year (today's dollars)"
              value={inputs.secondJob.annual}
              step={1000}
              onChange={(annual) => set((s) => ({ ...s, secondJob: { ...s.secondJob, annual } }))}
            />
            <NumberField
              label="Work until age"
              value={inputs.secondJob.endAge}
              min={40}
              max={80}
              onChange={(endAge) => set((s) => ({ ...s, secondJob: { ...s.secondJob, endAge: Math.round(endAge) } }))}
            />
            <Toggle
              label="Employer participates in RSA (ERS or TRS)"
              checked={inputs.secondJob.rsaEmployer}
              onChange={(rsaEmployer) => set((s) => ({ ...s, secondJob: { ...s.secondJob, rsaEmployer } }))}
            />
            {inputs.secondJob.rsaEmployer && (
              <>
                <Toggle
                  label="Full-time"
                  checked={inputs.secondJob.fullTime}
                  onChange={(fullTime) => set((s) => ({ ...s, secondJob: { ...s.secondJob, fullTime } }))}
                />
                <Note kind="warn">
                  Full-time work for any RSA participating employer suspends your pension. Part-time work is allowed only under RSA's yearly earnings limit
                  (check RSA's website for this year's figure) and after a 30-day break. Private-sector work has no limit.
                </Note>
              </>
            )}
          </>
        )}
        <h3>Social Security</h3>
        <Toggle
          label="Your City job pays into Social Security"
          checked={inputs.socialSecurity.cityJobCovered}
          onChange={(cityJobCovered) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, cityJobCovered } }))}
          hint="Check your pay stub for a Social Security or OASDI deduction."
        />
        <SocialSecurityPerson who="member" person={inputs.socialSecurity.member} detail={ss.member} set={set} />
        <SocialSecurityPerson who="spouse" person={inputs.socialSecurity.spouse} detail={ss.spouse} set={set} />
      </Section>

      <Section title="Spending in retirement">
        <MoneyField
          label="Core spending per year (today's dollars)"
          value={inputs.expenses.core}
          step={1000}
          onChange={(core) => set((s) => ({ ...s, expenses: { ...s.expenses, core } }))}
        />
        <MoneyField
          label="Healthcare per year before 65"
          value={inputs.expenses.healthPre65}
          step={500}
          onChange={(healthPre65) => set((s) => ({ ...s, expenses: { ...s.expenses, healthPre65 } }))}
        />
        <MoneyField
          label="Healthcare per year after 65"
          value={inputs.expenses.healthPost65}
          step={500}
          onChange={(healthPost65) => set((s) => ({ ...s, expenses: { ...s.expenses, healthPost65 } }))}
        />
        <Note>Include retiree and surviving-spouse coverage. Confirm premiums and eligibility with the City of Huntsville benefits office.</Note>
        <PsoExclusion inputs={inputs} result={result} set={set} />
        <MoneyField
          label="Mortgage payment per year"
          value={inputs.expenses.mortgageAnnual}
          step={500}
          onChange={(mortgageAnnual) => set((s) => ({ ...s, expenses: { ...s.expenses, mortgageAnnual } }))}
        />
        <NumberField
          label="Mortgage payoff year"
          value={inputs.expenses.mortgagePayoffYear}
          onChange={(y) => set((s) => ({ ...s, expenses: { ...s.expenses, mortgagePayoffYear: Math.round(y) } }))}
        />
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
              onChange={(mean) =>
                set((s) => ({ ...s, assumptions: { ...s.assumptions, returns: { ...s.assumptions.returns, [cls]: { ...s.assumptions.returns[cls], mean } } } }))
              }
            />
            <PercentField
              label={`${cls[0]!.toUpperCase()}${cls.slice(1)} volatility`}
              value={a.returns[cls].volatility}
              onChange={(volatility) =>
                set((s) => ({
                  ...s,
                  assumptions: { ...s.assumptions, returns: { ...s.assumptions.returns, [cls]: { ...s.assumptions.returns[cls], volatility } } },
                }))
              }
            />
          </div>
        ))}
        <NumberField
          label="Plan to age"
          value={a.longevityAge}
          min={70}
          max={110}
          onChange={(longevityAge) => set((s) => ({ ...s, assumptions: { ...s.assumptions, longevityAge: Math.round(longevityAge) } }))}
        />
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

/** Map any saved order (older versions had no Roth 457) onto one of the listed choices. */
function orderValue(order: AccountKind[]): string {
  const key = order.filter((k) => k !== 'roth457').join(',');
  if (key === '457b,pretax,taxable,roth') return '457b,pretax,taxable,roth457,roth';
  if (key === 'taxable,roth,457b,pretax') return 'taxable,roth457,roth,457b,pretax';
  return 'taxable,457b,pretax,roth457,roth';
}

function DeferredComp({ inputs, set }: { inputs: ScenarioInputs; set: Setter }) {
  const trad = inputs.accounts.find((a) => a.owner === 'member' && a.kind === '457b');
  const roth = inputs.accounts.find((a) => a.owner === 'member' && a.kind === 'roth457');
  const setKind = <F extends 'balance' | 'contribution' | 'notHeld'>(kind: '457b' | 'roth457', field: F, v: Account[F]) =>
    set((s) => {
      const exists = s.accounts.some((a) => a.owner === 'member' && a.kind === kind);
      const blank: Account = {
        id: kind === '457b' ? '457b' : '457b-roth',
        label: KIND_LABEL[kind],
        kind,
        owner: 'member',
        balance: 0,
        contribution: 0,
        allocation: (trad ?? roth)?.allocation ?? { stocks: 0.8, bonds: 0.2, cash: 0 },
      };
      const accounts = exists ? s.accounts : [...s.accounts, blank];
      return { ...s, accounts: accounts.map((a) => (a.owner === 'member' && a.kind === kind ? { ...a, [field]: v } : a)) };
    });
  const alloc = (trad ?? roth)?.allocation ?? { stocks: 0.8, bonds: 0.2, cash: 0 };
  const setAlloc = (key: 'stocks' | 'bonds' | 'cash', v: number) =>
    set((s) => ({ ...s, accounts: s.accounts.map((a) => (is457(a) ? { ...a, allocation: { ...a.allocation, [key]: v } } : a)) }));
  const allocSum = alloc.stocks + alloc.bonds + alloc.cash;
  const hasTrad = !trad?.notHeld;
  const hasRoth = !roth?.notHeld;
  const balance = (hasTrad ? (trad?.balance ?? 0) : 0) + (hasRoth ? (roth?.balance ?? 0) : 0);
  const contribution = (hasTrad ? (trad?.contribution ?? 0) : 0) + (hasRoth ? (roth?.contribution ?? 0) : 0);
  return (
    <fieldset className="account who-you">
      <legend>
        <WhoBadge who="you" />
        457(b) deferred compensation
      </legend>
      <h4>Traditional (pre-tax)</h4>
      <Toggle label="I don't have a traditional 457(b)" checked={!hasTrad} onChange={(off) => setKind('457b', 'notHeld', off)} />
      {hasTrad && (
        <div className="row wrap">
          <MoneyField label="Traditional balance" value={trad?.balance ?? 0} step={1000} onChange={(v) => setKind('457b', 'balance', v)} />
          <MoneyField label="Traditional yearly contribution" value={trad?.contribution ?? 0} onChange={(v) => setKind('457b', 'contribution', v)} />
        </div>
      )}
      <h4>Roth (after-tax)</h4>
      <Toggle label="I don't have a Roth 457(b)" checked={!hasRoth} onChange={(off) => setKind('roth457', 'notHeld', off)} />
      {hasRoth && (
        <div className="row wrap">
          <MoneyField label="Roth balance" value={roth?.balance ?? 0} step={1000} onChange={(v) => setKind('roth457', 'balance', v)} />
          <MoneyField label="Roth yearly contribution" value={roth?.contribution ?? 0} onChange={(v) => setKind('roth457', 'contribution', v)} />
        </div>
      )}
      {(hasTrad || hasRoth) && (
        <>
          <p className="total-line">
            Total 457(b) balance: <strong>{dollars(balance)}</strong>. Total yearly contribution: <strong>{dollars(contribution)}</strong>.
          </p>
          <div className="row wrap">
            <PercentField label="Stocks" value={alloc.stocks} step={5} min={0} max={100} onChange={(v) => setAlloc('stocks', v)} />
            <PercentField label="Bonds" value={alloc.bonds} step={5} min={0} max={100} onChange={(v) => setAlloc('bonds', v)} />
            <PercentField label="Cash" value={alloc.cash} step={5} min={0} max={100} onChange={(v) => setAlloc('cash', v)} />
          </div>
          {Math.abs(allocSum - 1) > 0.001 && <Note kind="warn">Stocks, bonds and cash add up to {Math.round(allocSum * 100)}%, not 100%.</Note>}
          <p className="hint">
            Traditional withdrawals are taxed as income. Roth withdrawals are tax-free once you are 59½ and the Roth account is 5 years old (the app treats them
            as tax-free). The yearly IRS limit covers both together. Neither has the 10% early withdrawal penalty after you leave the City.
          </p>
        </>
      )}
    </fieldset>
  );
}

function SocialSecurityPerson({ who, person, detail, set }: { who: 'member' | 'spouse'; person: SsPerson; detail: SsDetail | null; set: Setter }) {
  const you = who === 'member';
  const name = you ? 'You' : 'Your spouse';
  const upd = (u: Partial<SsPerson>) => set((s) => ({ ...s, socialSecurity: { ...s.socialSecurity, [who]: { ...s.socialSecurity[who], ...u } } }));
  const fraAge = detail ? `${Math.floor(detail.fraAgeMonths / 12)}${detail.fraAgeMonths % 12 ? ` and ${detail.fraAgeMonths % 12} months` : ''}` : '67';
  return (
    <fieldset className={`account who-${you ? 'you' : 'spouse'}`}>
      <legend>
        <WhoBadge who={you ? 'you' : 'spouse'} />
        {you ? 'Your Social Security' : "Spouse's Social Security"}
      </legend>
      <Toggle label={`Include ${you ? 'your' : "your spouse's"} benefit`} checked={person.include} onChange={(include) => upd({ include })} />
      {person.include && (
        <>
          <SelectField
            label="Benefit amount"
            value={person.source}
            options={[
              ['estimate', 'Estimate it for me'],
              ['statement', 'I have my SSA statement'],
            ]}
            onChange={(source) => upd({ source })}
          />
          {person.source === 'statement' ? (
            <MoneyField
              label="Monthly benefit at full retirement age"
              value={person.fraMonthly}
              step={50}
              onChange={(fraMonthly) => upd({ fraMonthly })}
              hint={`From the statement at ssa.gov/myaccount: the amount at full retirement age (${fraAge}). The app adjusts it for your claiming age.`}
            />
          ) : (
            <>
              <div className="row wrap">
                <NumberField
                  label="Years already worked paying Social Security tax"
                  value={person.pastYears}
                  min={0}
                  max={50}
                  onChange={(v) => upd({ pastYears: Math.max(0, Math.round(v)) })}
                  hint={you ? 'Include your fire department years so far and any earlier jobs.' : undefined}
                />
                <MoneyField
                  label="Average yearly pay in those years (today's dollars)"
                  value={person.pastAverage}
                  step={1000}
                  onChange={(pastAverage) => upd({ pastAverage })}
                />
              </div>
              {you ? (
                <p className="hint">Your future City pay comes from the pay and promotion plan on the first tab, plus any second job below.</p>
              ) : (
                <div className="row wrap">
                  <MoneyField
                    label="Spouse's yearly pay now"
                    value={person.currentEarnings}
                    step={1000}
                    onChange={(currentEarnings) => upd({ currentEarnings })}
                  />
                  <NumberField label="Spouse stops working at age" value={person.stopAge} min={40} max={75} onChange={(v) => upd({ stopAge: Math.round(v) })} />
                </div>
              )}
            </>
          )}
          <NumberField
            label="Claiming age"
            value={person.claimAge}
            min={62}
            max={70}
            onChange={(v) => upd({ claimAge: Math.min(70, Math.max(62, Math.round(v))) })}
          />
          {detail && (
            <p className="total-line">
              {name}: about <strong>{monthly(detail.monthly)}</strong> a month at {person.claimAge}
              {person.source === 'estimate' ? ' (a rough estimate)' : ''}, in today&apos;s dollars.
            </p>
          )}
          {detail?.estimate && (
            <ShowMath>
              <pre className="formula">
                {`${detail.estimate.yearsWithEarnings} years of earnings; the highest 35 count, capped at $184,500 a year.\n`}
                {`Average indexed monthly earnings: ${dollars(detail.estimate.aime)}\n`}
                {`90% of the first $1,286 + 32% up to $7,749 + 15% above = ${monthly(detail.fraMonthly)} at full retirement age (${fraAge})\n`}
                {`Claiming at ${person.claimAge}: × ${detail.factor.toFixed(3)} = ${monthly(detail.monthly)} a month`}
              </pre>
              <p className="hint">
                A rough estimate using 2026 SSA figures and today&apos;s wages. For your real number, sign in at ssa.gov/myaccount and switch to &ldquo;I have
                my SSA statement.&rdquo;
              </p>
            </ShowMath>
          )}
          {!detail?.estimate && detail && (
            <p className="hint">
              {monthly(detail.fraMonthly)} at full retirement age × {detail.factor.toFixed(3)} for claiming at {person.claimAge}.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

/** IRC 402(l): a retired public safety officer can exclude up to $3,000 a year of health or long-term care premiums. */
function PsoExclusion({ inputs, result, set }: { inputs: ScenarioInputs; result: ScenarioResult; set: Setter }) {
  const saved = inputs.psoPremiumExclusion ? psoSavings(result.plan) : null;
  return (
    <>
      <Toggle
        label="Use the public safety officer premium exclusion"
        checked={inputs.psoPremiumExclusion}
        onChange={(psoPremiumExclusion) => set((s) => ({ ...s, psoPremiumExclusion }))}
        hint="As a firefighter retired at normal retirement age or for disability, you can leave up to $3,000 a year of health or long-term care premiums (for you, your spouse or dependents) out of your federal taxable income. It comes out of your RSA pension or City 457(b), and the plan no longer has to pay the insurer directly. When you file, check the PSO box on Form 1040 line 5c."
      />
      {saved && saved.years > 0 && (
        <Note>
          This saves about {dollars(Math.round(saved.perYear / 10) * 10)} a year in federal income tax for {saved.years} years, or about {k(saved.total)} in all
          (today&apos;s dollars). The $3,000 isn&apos;t indexed, so it is worth less each year. It stops if you die first, because only the retired officer can
          use it. The app assumes at least $3,000 of your healthcare cost is premiums. Alabama tax is not changed, since RSA pensions are already exempt there.
        </Note>
      )}
    </>
  );
}
