import { deathByYear, inServiceDeathEligibility, plopCumulative, plopToDestination, PLOP_MORTGAGE, PLOP_PURCHASE, type ScenarioInputs, type ScenarioResult } from '../../engine/model';
import { plopLimits } from '../../engine/plop';
import { WORK_SCHEDULES } from '../../engine/sickLeave';
import { OPTION_LABELS, type SurvivorOption } from '../../engine/survivor';
import { PlopChart, PurchasingPowerChart } from '../charts';
import { Assumptions, KeyNumber, MonthYearField, MoneyField, Note, NumberField, PercentField, Section, SelectField, SettingLine, ShowMath, Table, Toggle } from '../components';
import { cents, dollars, k, monthly, pct, years, ym } from '../format';
import { LeavePayout } from './LeavePayout';
import type { Setter } from './You';

export function Pension({ inputs, result, set, onEditSchedule }: { inputs: ScenarioInputs; result: ScenarioResult; set: Setter; onEditSchedule?: () => void }) {
  const p = result.pension;
  const a = inputs.assumptions;
  const sl = p.sickLeave;
    const tier2 = inputs.member.tier === 'tier2';
  const limits = plopLimits(p.maximum.monthly);
  const death = deathByYear(inputs, p);
  const deathElig = inServiceDeathEligibility(inputs, p);
  const maxGap = Math.max(0, ...death.map((d) => d.gap));
  const stocks = a.returns.stocks.mean;
  const plopDest = plopToDestination(inputs, p);
  const mortgageRate = inputs.expenses.mortgageRate ?? 0.04;
  // Paying down the mortgage "earns" its interest rate; a purchase earns nothing.
  const lumpReturn = plopDest.use === 'mortgage' ? mortgageRate : plopDest.use === 'purchase' ? 0 : stocks;
  const plopCurve = plopCumulative(p, lumpReturn, a.inflation, a.longevityAge);
  const retireYear = p.retirementDate.year;
  const power = Array.from({ length: Math.max(1, a.longevityAge - Math.floor(p.ageAtRetirement) + 1) }, (_, i) => {
    const nominal = p.finalMonthly * Math.pow(1 + a.pensionCola, i);
    return { age: Math.floor(p.ageAtRetirement) + i, nominal, real: nominal / Math.pow(1 + a.inflation, i + (retireYear - inputs.today.year)) };
  });
  const at85 = power.find((r) => r.age === 85);
  const letter = inputs.survivor.letter;
  const letterCount = (['maximum', 'option1', 'option2', 'option3', 'option4'] as const).filter((key) => (letter[key] ?? 0) > 0).length;
  const setLetter = (key: keyof typeof letter, v: number) => set((s) => ({ ...s, survivor: { ...s.survivor, letter: { ...s.survivor.letter, [key]: v > 0 ? v : null } } }));

  return (
    <div className="stack">
      <div className="keys">
        <KeyNumber label="Monthly pension" value={monthly(p.finalMonthly)} sub={`${k(p.finalMonthly * 12)} a year, ${OPTION_LABELS[inputs.survivor.option]}${p.plop.lumpSum > 0 ? ', after PLOP' : ''}`} />
        <KeyNumber label="Retire" value={ym(p.retirementDate)} sub={`Age ${Math.floor(p.ageAtRetirement)}, ${years(p.service.creditedMonths)} of credit`} />
        <KeyNumber label="Maximum benefit" value={monthly(p.maximum.monthly)} sub="Before any survivor option or PLOP" />
      </div>
      {!p.eligibility.eligible && <Note kind="warn">Not eligible to retire on this date: {p.eligibility.reason}.</Note>}
      <Assumptions
        items={[
          ['Average final salary', `${dollars(p.maximum.afs)}: highest ${p.afsYears.length} of the last 10 fiscal years`],
          ['Benefit factor', pct(p.maximum.factor, 4)],
          ['Service credit', `${years(p.service.actualMonths)} actual + ${years(p.service.sickLeaveMonths)} sick leave + ${years(p.service.stressMonths)} stress credit`],
          ['Pay', `Schedule COLA ${pct(inputs.pay.scheduleColaPct)} a year, one step a year, ${inputs.pay.fitnessIncentive ? 'fitness incentive 5%' : 'no fitness incentive'}, FY2027 schedule as published (it includes this year's 2% COLA)`],
          ['Survivor option', p.chosen.basis === 'letter' ? 'From your RSA estimate letter' : 'Rough estimate (enter your letter below for the exact figure)'],
        ]}
      />
      <ShowMath>
        <pre className="formula">
          {`${cents(p.maximum.afs)} × ${(p.maximum.creditedMonths / 12).toFixed(4)} years × ${p.maximum.factor} ÷ 12 = ${cents(p.maximum.formulaMonthly)} Maximum per month`}
          {p.maximum.capped ? `\nCapped at 80% of average final salary: ${cents(p.maximum.monthly)}` : ''}
          {p.maximum.reduction > 0 ? `\nReduced ${pct(p.maximum.reduction)} for retiring before 56: ${cents(p.maximum.monthly)}` : ''}
          {`\n${OPTION_LABELS[p.chosen.option]}: ${cents(p.chosen.retireeMonthly)}`}
          {p.plop.lumpSum > 0 ? `\nPLOP ${dollars(p.plop.lumpSum)}: ${(p.plop.lumpSum / 1000).toFixed(0)} × $${p.plop.per1000.toFixed(2)} = ${cents(p.plop.monthlyReduction)} less per month → ${cents(p.finalMonthly)}` : ''}
        </pre>
        <Table
          caption="Pay by fiscal year (earnable compensation counted by RSA)"
          head={['Fiscal year', 'Grade / step', 'Base', 'Fitness', 'Overtime', 'Counted', 'In average']}
          rows={p.salary.slice(-12).map((y) => [
            `FY${y.fiscalYear}`,
            `${y.grade} / ${y.step}${y.promoted ? ' (promoted)' : ''}`,
            dollars(y.base),
            dollars(y.incentive),
            dollars(y.overtime),
            dollars(y.earnable),
            p.afsYears.some((x) => x.fiscalYear === y.fiscalYear) ? 'Yes' : '',
          ])}
        />
      </ShowMath>

      <Section title="Survivor options" who="beneficiary">
        <p className="lead">
          Enter the amounts from your RSA estimate letter for exact figures. Without them, Options 1 to 3 are rough estimates scaled from one real RSA letter.
        </p>
        <SelectField
          label="Your choice"
          value={inputs.survivor.option}
          options={(['maximum', 'option1', 'option2', 'option3', 'option4'] as SurvivorOption[]).map((o) => [o, OPTION_LABELS[o]])}
          onChange={(option) => set((s) => ({ ...s, survivor: { ...s.survivor, option } }))}
        />
        <MonthYearField
          label="Beneficiary birth month and year"
          value={inputs.survivor.beneficiaryBirth}
          onChange={(beneficiaryBirth) => set((s) => ({ ...s, survivor: { ...s.survivor, beneficiaryBirth } }))}
        />
        <Table
          caption="Monthly benefit by option"
          head={['Option', 'You receive', 'Survivor receives', 'Basis']}
          rows={p.options.map((o) => [OPTION_LABELS[o.option], monthly(o.retireeMonthly), o.survivorMonthly > 0 ? monthly(o.survivorMonthly) : 'None', o.option === 'maximum' ? 'RSA formula' : o.basis === 'letter' ? 'Your letter' : 'Estimate'])}
        />
        <details className="letter-panel">
          <summary>
            <svg className="letter-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M6 2h9l5 5v15H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M15 2v5h5M9 12h8M9 16h8M9 8h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="letter-title">Enter figures from your RSA estimate letter</span>
            <span className={`letter-status${letterCount > 0 ? ' on' : ''}`}>{letterCount > 0 ? `Using your letter (${letterCount} of 5)` : 'Not entered: using estimates'}</span>
          </summary>
          <p>
            These are <strong>exact figures from RSA</strong>, not estimates. Copy them from your Benefit Estimate letter. Use the same letter for all of them. The
            app applies each option&apos;s share of the letter&apos;s Maximum to your projected Maximum, and marks those rows &quot;Your letter&quot; in the table
            above.
          </p>
          <div className="row wrap">
            <MoneyField label="Letter: Maximum" value={letter.maximum ?? 0} step={0.01} onChange={(v) => setLetter('maximum', v)} />
            <MoneyField label="Letter: Option 1" value={letter.option1 ?? 0} step={0.01} onChange={(v) => setLetter('option1', v)} />
            <MoneyField label="Letter: Option 2" value={letter.option2 ?? 0} step={0.01} onChange={(v) => setLetter('option2', v)} />
            <MoneyField label="Letter: Option 3" value={letter.option3 ?? 0} step={0.01} onChange={(v) => setLetter('option3', v)} />
            <MoneyField label="Letter: Option 4" value={letter.option4 ?? 0} step={0.01} onChange={(v) => setLetter('option4', v)} />
          </div>
        </details>
      </Section>

      <Section title="PLOP (partial lump sum)" who="you" notApplicable={inputs.plop.months === 0 ? "You're not taking a PLOP (0 months)." : undefined}>
        <NumberField
          label="Months of the Maximum to take as a lump sum (0 = none)"
          value={inputs.plop.months}
          min={0}
          max={24}
          onChange={(v) => set((s) => ({ ...s, plop: { ...s.plop, months: Math.max(0, Math.min(24, Math.round(v))) } }))}
          hint={`Allowed: ${dollars(limits.min)} to ${dollars(limits.max)} in $1,000 steps (1 to 24 months).`}
        />
        <SelectField
          label="Where the lump sum goes"
          value={inputs.plop.destination ?? '457b'}
          options={[
            ...inputs.accounts.filter((acc) => !acc.notHeld).map((acc) => [acc.id, `Invest it: ${acc.label}`] as [string, string]),
            [PLOP_MORTGAGE, 'Pay down the mortgage'],
            [PLOP_PURCHASE, 'A large purchase (spend it)'],
          ]}
          onChange={(destination) => set((s) => ({ ...s, plop: { ...s.plop, destination } }))}
          hint="Rolling it into a retirement plan defers tax. Anything else is paid to you and taxed as income that year (20% is withheld for federal tax)."
        />
        {p.plop.lumpSum > 0 && plopDest.use === 'account' && (
          <ShowMath label="Is there a limit on how much I can roll over?">
            <p>
              No. RSA treats the PLOP as an eligible rollover distribution, so you can roll over all or part of it. A direct rollover into your 457(b), a
              traditional IRA or another pre-tax plan is not a contribution, so the yearly limits (for example $7,500 for an IRA in 2026) don&apos;t apply. No tax
              is due and nothing is withheld until you take the money out.
            </p>
            <ul>
              <li>Ask RSA for a direct rollover. If the check is paid to you, 20% is withheld, and you have 60 days to deposit the full amount to avoid tax.</li>
              <li>
                Yearly limits only matter if you take the cash and then put it in as a regular contribution, so only a small part of it would fit.
              </li>
              <li>
                You can roll it into a Roth IRA, but the whole amount is taxed as income that year. The app treats a Roth destination that way. It can&apos;t go
                straight into a Roth 457(b).
              </li>
              <li>
                Withdrawals from an IRA before age 59½ usually owe a 10% extra tax, and the app models that. Money rolled into the 457(b) is kept in a separate
                account. Ask your plan whether the 10% applies to it before 59½. The app assumes it doesn&apos;t.
              </li>
            </ul>
            <p className="hint">
              Sources: RSA, Partial Lump Sum Option Plan; IRS Topic 413, Rollovers from retirement plans; IRS Rollover Chart; IRS Publication 590-A.
            </p>
          </ShowMath>
        )}
        {plopDest.use === 'mortgage' && (
          <>
            <PercentField
              label="Mortgage interest rate"
              value={mortgageRate}
              step={0.125}
              min={0}
              onChange={(mortgageRate) => set((s) => ({ ...s, expenses: { ...s.expenses, mortgageRate } }))}
              hint={`Uses your mortgage payment of ${dollars(inputs.expenses.mortgageAnnual)} a year and payoff year ${inputs.expenses.mortgagePayoffYear} from the Savings tab. Estimated balance when you retire: ${dollars(plopDest.mortgageBalance)}.`}
            />
            {plopDest.mortgageBalance <= 0 && <Note kind="warn">Your mortgage is paid off before you retire, so the whole lump sum goes to savings.</Note>}
          </>
        )}
        {plopDest.use === 'purchase' && (
          <MoneyField
            label="Purchase amount (0 = all of it)"
            value={inputs.plop.purchaseAmount ?? 0}
            step={1000}
            onChange={(purchaseAmount) => set((s) => ({ ...s, plop: { ...s.plop, purchaseAmount } }))}
            hint={`In ${p.retirementDate.year} dollars. Anything left over goes to your taxable savings.`}
          />
        )}
        {p.plop.lumpSum > 0 && !plopDest.rollover && (
          <Note>
            {plopDest.use === 'account' ? "This account isn't a pre-tax retirement plan, so the" : 'The'} lump sum is taxed as income in {p.retirementDate.year}: about{' '}
            {dollars(plopDest.tax)} in federal and Alabama tax, leaving <strong>{dollars(plopDest.net)}</strong>.{' '}
            {plopDest.use === 'mortgage'
              ? plopDest.toMortgage >= plopDest.mortgageBalance - 0.5
                ? `That pays off your ${dollars(plopDest.mortgageBalance)} mortgage, so its ${dollars(inputs.expenses.mortgageAnnual)} yearly payment stops${plopDest.leftover > 500 ? `, and ${dollars(plopDest.leftover)} is left for savings` : ''}.`
                : `That pays ${dollars(plopDest.toMortgage)} of your ${dollars(plopDest.mortgageBalance)} balance. With the same payment, the mortgage is gone after ${plopDest.mortgagePayoffYear} instead of ${inputs.expenses.mortgagePayoffYear}.`
              : plopDest.use === 'purchase'
                ? `You spend ${dollars(plopDest.spent)}, and the app counts it as gone from your savings${plopDest.leftover > 500 ? `. The other ${dollars(plopDest.leftover)} goes to savings` : ''}.`
                : 'Choose your traditional 457(b) or another pre-tax account to roll it over tax-free.'}
          </Note>
        )}
        <NumberField
          label="Reduction per $1,000 from your letter (0 = RSA table)"
          value={inputs.plop.per1000Override ?? 0}
          step={0.01}
          min={0}
          onChange={(v) => set((s) => ({ ...s, plop: { ...s.plop, per1000Override: v > 0 ? v : null } }))}
          hint={`RSA table at age ${Math.floor(p.ageAtRetirement)}: $${p.plop.per1000.toFixed(2)} per month for each $1,000 (Maximum option).`}
        />
        {p.plop.lumpSum > 0 ? (
          <>
            <p>
              A {dollars(p.plop.lumpSum)} lump sum lowers your pension by {cents(p.plop.monthlyReduction)} a month for life. To beat the pension it gives up by your
              life expectancy (about age {Math.round(p.ageAtRetirement + p.lifeExpectancyAtRetirement)}), it needs to earn about <strong>{pct(p.plopBreakEven)}</strong> a year.
            </p>
            {plopDest.use === 'mortgage' && (
              <p>
                Paying down the mortgage &quot;earns&quot; its {pct(mortgageRate)} interest rate with no market risk.{' '}
                {mortgageRate >= p.plopBreakEven
                  ? 'That beats the break-even return, so the PLOP pays for itself.'
                  : 'That is below the break-even return, so over a full lifetime the pension you give up is worth more than the interest you save. Paying off the mortgage still lowers your bills and risk in early retirement.'}
              </p>
            )}
            {plopDest.use === 'purchase' && (
              <p>
                A purchase earns no return, so the PLOP never breaks even in dollars: you trade {cents(p.plop.monthlyReduction)} a month for life for the purchase now.
                The chart shows how much pension you give up over time.
              </p>
            )}
            <PlopChart data={plopCurve} />
            <Assumptions items={[['Lump sum return', plopDest.use === 'mortgage' ? `${pct(mortgageRate)} a year (mortgage rate)` : plopDest.use === 'purchase' ? 'None (spent)' : `${pct(stocks)} a year (stock return assumption)`], ['Inflation', pct(a.inflation)], ['Life expectancy', 'Rough population estimate, not RSA tables']]} />
          </>
        ) : (
          <p className="hint">Choose a number of months to see the break-even return and the cumulative difference.</p>
        )}
      </Section>

      <Section title="Sick leave" who="you">
        <SettingLine label="Work schedule" value={WORK_SCHEDULES[inputs.sickLeave.workSchedule].label} onEdit={onEditSchedule} where="the You and your pay tab" />
        <p className="hint">
          {inputs.sickLeave.workSchedule === 'fireSuppression'
            ? 'Accrues 145.6 hours a year: 4 hours per pay period, scaled for a 2,912-hour year. 11.2 hours count as one 8-hour day (Personnel Manual 10.7(D)). No cap.'
            : 'Accrues 104 hours a year: 4 hours per pay period. 8 hours make one day (Personnel Manual 10.7(D)). No cap.'}
        </p>
        <NumberField label="Current balance" value={inputs.sickLeave.balanceHours} min={0} step={1} suffix="hours" onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, balanceHours: v } }))} />
        <NumberField label="Hours used per year" value={inputs.sickLeave.usedHoursPerYear} min={0} suffix="hours" onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, usedHoursPerYear: v } }))} />
        <SelectField
          label="At retirement"
          value={inputs.sickLeave.choice}
          options={[
            ['cash', 'Take 50% as cash'],
            ['credit', 'Convert to service credit'],
          ]}
          onChange={(choice) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, choice } }))}
          hint="One or the other, not both (Personnel Manual 10.7(H))."
        />
        <p className="hint">Sick leave credit is capped at 36 months (730 days), the top of RSA's conversion chart.</p>
        {tier2 && <Note kind="warn">Tier II members cannot convert sick leave to service credit (ERS Handbook p.21).</Note>}
        <h3>Cash or credit</h3>
        <div className="keys">
          <KeyNumber label="Cash after tax" value={k(sl.cashAfterTax)} sub={`50% of ${Math.round(sl.hours)} hours, about ${pct(1 - sl.cashAfterTax / Math.max(1, sl.cashGross), 0)} tax`} />
          <KeyNumber label="Credit: lifetime value" value={k(sl.pensionIncreaseValue)} sub={`${sl.creditMonths} months of credit = ${monthly(sl.pensionIncreaseMonthly)} more a month`} />
        </div>
        <p>
          {sl.better === 'credit' ? 'Converting to service credit' : 'Taking the cash'} looks better here. The added pension repays the after-tax cash in about{' '}
          {Number.isFinite(sl.breakEvenMonths) ? `${Math.round(sl.breakEvenMonths / 12)} years` : 'never'}.
        </p>
        <ShowMath>
          <pre className="formula">
            {`${Math.round(sl.hours)} hours ÷ ${WORK_SCHEDULES[inputs.sickLeave.workSchedule].hoursPerDay} = ${sl.days.toFixed(1)} days → ${sl.creditMonths} months on RSA's chart\n`}
            {`Credit: ${dollars(p.maximum.afs)} × ${(sl.creditMonths / 12).toFixed(3)} × ${p.maximum.factor} ÷ 12 = ${cents(sl.pensionIncreaseMonthly)} a month\n`}
            {`Cash: ${Math.round(sl.hours)} hours × hourly rate × 50% = ${dollars(sl.cashGross)}, ${dollars(sl.cashAfterTax)} after tax`}
          </pre>
        </ShowMath>
      </Section>

      <LeavePayout inputs={inputs} pension={p} set={set} onEditSchedule={onEditSchedule} />

      <Section title="If you die before you can retire" who="beneficiary">
        <p>
          Before retirement eligibility, your beneficiary gets your contributions plus interest and one year of salary, not a pension.
          {maxGap > 0 && (
            <>
              {' '}
              The largest gap is about <strong>{k(maxGap)}</strong>. Term life insurance in about that amount, ending at eligibility, would fill it.
            </>
          )}
        </p>
        {deathElig && (
          <Note>
            From <strong>{ym(deathElig.date)}</strong>, if you die while still working, a spouse who is your only beneficiary could take a lifetime Option 2 benefit of about{' '}
            <strong>{monthly(deathElig.survivorMonthly)}</strong> a month (a rough estimate), figured like a normal retirement on that date.
            {deathElig.viaStressCredit && (
              <>
                {' '}
                Stress credit gets you there early: {years(deathElig.actualMonths)} of actual service plus {years(deathElig.stressMonths)} of stress credit makes 25 years.
              </>
            )}{' '}
            After that the benefit keeps growing with your pay and service, as in the table below.
          </Note>
        )}
        <Table
          caption="Death benefit by year"
          head={['Year', 'Your age', 'Eligible?', 'Lump sum', 'Beneficiary pension', 'Gap to fill']}
          rows={death.map((d) => [String(d.year), String(d.age), d.eligible ? 'Yes' : 'No', k(d.lumpSum), d.survivorMonthly > 0 ? `${monthly(d.survivorMonthly)}/mo` : 'None', d.gap > 0 ? k(d.gap) : '—'])}
        />
        <Note>
          ERS Handbook p.16: hazardous duty (stress) credit counts toward retirement eligibility for an in-service death of a firefighter. Sick leave is not
          counted here, because it converts only at retirement. Confirm survivor benefits with RSA.
        </Note>
      </Section>

      <Section title="Pension after retirement" who="you">
        <Toggle
          label={`Assume a ${pct(a.pensionCola)} retiree COLA`}
          checked={a.pensionCola > 0}
          onChange={(on) => set((s) => ({ ...s, assumptions: { ...s.assumptions, pensionCola: on ? 0.01 : 0 } }))}
          hint="Retiree COLAs need the Legislature and the city council to approve and fund them. None are guaranteed."
        />
        <PurchasingPowerChart data={power} />
        {at85 && (
          <p>
            At 85, your {monthly(at85.nominal)} pension would buy what {monthly(at85.real)} buys today.
          </p>
        )}
      </Section>
    </div>
  );
}
