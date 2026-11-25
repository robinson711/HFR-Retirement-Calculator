import { computeLeave, type PensionResult, type ScenarioInputs } from '../../engine/model';
import { WORK_SCHEDULES, type WorkSchedule } from '../../engine/sickLeave';
import { KeyNumber, MoneyField, Note, NumberField, Section, SelectField, ShowMath, Table, Toggle } from '../components';
import { dollars, k, ym } from '../format';
import type { Setter } from './You';

const AGE_CATCH_UP_LABEL = {
  none: 'none (you are under 50 that year)',
  age50: 'the age 50 catch-up',
  age60to63: 'the ages 60 to 63 catch-up',
} as const;

export function LeavePayout({ inputs, pension, set }: { inputs: ScenarioInputs; pension: PensionResult; set: Setter }) {
  const l = computeLeave(inputs, pension);
  const r = l.room;
  const upd = (u: Partial<ScenarioInputs['leave']>) => set((s) => ({ ...s, leave: { ...s.leave, ...u } }));
  const schedule = WORK_SCHEDULES[inputs.sickLeave.workSchedule];
  const saved = l.without.incomeTax - l.withDeferral.incomeTax;
  const cashGivenUp = l.without.netCash - l.withDeferral.netCash;
  const d = pension.retirementDate;
  const year = l.calendarYear;
  const prior = { year: d.month === 1 ? d.year - 1 : d.year, month: d.month === 1 ? 12 : d.month - 1 };
  const usingSpecial = r.catchUpKind === 'special';
  return (
    <Section title="Other leave paid at retirement" who="you">
      <p className="lead">
        Annual, holiday and compensatory leave are paid at 100% of your hourly rate when you leave, up to each cap. Enter the balances you expect to have on
        your last day.
      </p>
      <SelectField
        label="Work schedule"
        value={inputs.sickLeave.workSchedule}
        options={Object.entries(WORK_SCHEDULES).map(([key, v]) => [key as WorkSchedule, v.label])}
        onChange={(workSchedule) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, workSchedule } }))}
        hint={`Sets your hourly rate (final base pay ÷ ${schedule.hoursPerYear.toLocaleString()} hours) and the caps: ${l.payout.lines
          .map((x) => `${x.label.toLowerCase()} ${x.capHours} hours`)
          .join(', ')}. Personnel Manual 10.6, 8.13 and 8.12(A). This is the same setting as in Sick leave above.`}
      />
      <div className="row wrap">
        <NumberField label="Annual leave" value={inputs.leave.annualHours} min={0} suffix="hours" onChange={(v) => upd({ annualHours: Math.max(0, v) })} />
        <NumberField label="Holiday leave" value={inputs.leave.holidayHours} min={0} suffix="hours" onChange={(v) => upd({ holidayHours: Math.max(0, v) })} />
        <NumberField label="Compensatory time" value={inputs.leave.compHours} min={0} suffix="hours" onChange={(v) => upd({ compHours: Math.max(0, v) })} />
      </div>
      <Table
        caption={`Payout in ${year} at ${dollars(l.hourlyRate)} an hour (final base pay ÷ ${schedule.hoursPerYear.toLocaleString()} hours)`}
        head={['Leave', 'Your hours', 'Paid up to', 'Paid hours', 'Payout']}
        rows={[
          ...l.payout.lines.map((x) => [x.label, String(Math.round(x.hours)), `${x.capHours} h`, String(Math.round(x.paidHours)), dollars(x.amount)]),
          ['Total', '', '', '', dollars(l.payout.total)],
        ]}
      />
      {l.payout.lines.some((x) => x.hours > x.capHours) && <Note kind="warn">Hours above a cap are not paid. Use them before you retire if you can.</Note>}

      <h3>Put part of it in your 457(b): step by step</h3>
      <p>
        Normally your leave payout is added to your last paycheck and taxed as income that year, on top of everything else you earned. Instead, you can have
        part of it go straight into your <strong>traditional (pre-tax) 457(b)</strong>. That part is not taxed now. It grows in the account and is taxed later,
        when you take it out, often at a lower rate. Social Security and Medicare tax still applies either way.
      </p>

      <ol className="steps">
        <li>
          <h4>Check that your plan allows it</h4>
          <p>
            Federal rules allow it, but only if the City&apos;s deferred compensation plan offers it. Ask the plan before you count on it. Then turn it on here
            to see what it would do.
          </p>
          <Toggle label="Defer part of the payout into my traditional 457(b)" checked={inputs.leave.defer} onChange={(defer) => upd({ defer })} />
        </li>

        <li>
          <h4>Find out which catch-up you get</h4>
          <p>
            Everyone can put in the yearly limit: <strong>{dollars(r.limit)}</strong> in {year}. On top of that you may get a catch-up. You turn{' '}
            {r.ageAtYearEnd} in {year}, so your age catch-up is {AGE_CATCH_UP_LABEL[r.ageCatchUpKind]}
            {r.ageCatchUp > 0 ? `: ${dollars(r.ageCatchUp)} more.` : '.'}
          </p>
          <p>
            457(b) plans also have a <strong>special 3-year catch-up</strong>. In the 3 years before your plan&apos;s normal retirement age, you can put in up
            to twice the yearly limit, but only to make up limit you didn&apos;t use in earlier years. You can&apos;t use it and the age catch-up in the same
            year, so the app uses whichever is bigger.
          </p>
          <Toggle
            label="I'm in the last 3 years before my plan's normal retirement age"
            checked={inputs.leave.specialCatchUp}
            onChange={(specialCatchUp) => upd({ specialCatchUp })}
            hint="Your plan sets the normal retirement age. Ask it whether you qualify."
          />
          {inputs.leave.specialCatchUp && (
            <MoneyField
              label="Unused limit from earlier years"
              value={inputs.leave.underusedPriorYears}
              step={1000}
              onChange={(underusedPriorYears) => upd({ underusedPriorYears })}
              hint="Each past year's limit minus what you put in, added up. Your plan can calculate it for you."
            />
          )}
          <p className="total-line">
            {usingSpecial
              ? `The special catch-up gives you more: up to ${dollars(r.specialTotal)} in ${year}, compared with ${dollars(r.limit + r.ageCatchUp)} using the age catch-up.`
              : inputs.leave.specialCatchUp
                ? `The age catch-up gives you more: ${dollars(r.limit + r.ageCatchUp)}, compared with ${dollars(r.specialTotal)} using the special catch-up.`
                : `Your most for ${year}: ${dollars(r.limit)} + ${dollars(r.ageCatchUp)} catch-up = ${dollars(r.yearMax)}.`}
          </p>
        </li>

        <li>
          <h4>Subtract what you have already put in this year</h4>
          <p>
            The limit is for the whole calendar year, and it includes what comes out of your regular paychecks. Based on your 457(b) contributions on the
            Savings tab, you will have put in about <strong>{dollars(l.alreadyDeferred)}</strong> from January until you retire in {ym(d)}.
          </p>
          <p className="total-line">
            {dollars(r.yearMax)} − {dollars(l.alreadyDeferred)} = <strong>{dollars(r.room)}</strong> of room left for your leave payout.
            {r.estimatedLimits ? ' IRS limits after 2027 are estimates grown with inflation.' : ''}
          </p>
          {r.room <= 0 && (
            <Note kind="warn">
              Your paycheck deferrals already use up the {year} limit. To make room, lower your regular 457(b) contributions in the months before you retire.
            </Note>
          )}
        </li>

        <li>
          <h4>Check the Roth rule for higher earners</h4>
          <p>
            If you earned more than {dollars(r.rothThreshold)} from the City the year before, the IRS requires age-based catch-up money to go in as Roth (taxed
            now, tax-free later). The regular limit and the special 3-year catch-up can still be pre-tax.
          </p>
          {r.catchUpMustBeRoth ? (
            <Note kind="warn">
              Your pay the year before you retire is about {dollars(r.priorYearWages)}, which is over the line. The {dollars(r.ageCatchUp)} catch-up part would
              be Roth, so it would not lower your tax this year. The app treats the whole deferral as pre-tax, so the tax savings below are a bit too high.
            </Note>
          ) : (
            <p className="hint">
              {r.ageCatchUp > 0 && !usingSpecial
                ? `Your pay the year before is about ${dollars(r.priorYearWages)}, under the line, so all of it can be pre-tax.`
                : 'This does not affect you, because you are not using an age catch-up.'}
            </p>
          )}
        </li>

        <li>
          <h4>Choose how much to put in</h4>
          {inputs.leave.defer ? (
            <MoneyField
              label="Amount to defer (0 = as much as allowed)"
              value={inputs.leave.deferAmount}
              step={500}
              onChange={(deferAmount) => upd({ deferAmount })}
              hint={`Up to ${dollars(l.maxDeferrable)}: the smaller of your room and your payout, less the Social Security, Medicare and income tax that still comes out of the cash part.`}
            />
          ) : (
            <p className="hint">Turn on step 1 to choose an amount.</p>
          )}
        </li>

        <li>
          <h4>See what it does to your taxes</h4>
          {l.withDeferral.deferred > 0 ? (
            <p>
              Your payout is {dollars(l.payout.total)}. If you put <strong>{dollars(l.withDeferral.deferred)}</strong> in your 457(b), you pay about{' '}
              <strong>{dollars(saved)} less</strong> in federal and Alabama income tax for {year}. Your cash in hand goes from {dollars(l.without.netCash)} to{' '}
              {dollars(l.withDeferral.netCash)}, so you give up {dollars(cashGivenUp)} of take-home pay now to add {dollars(l.withDeferral.deferred)} to your
              retirement savings. That is about {Math.round((cashGivenUp / l.withDeferral.deferred) * 100)} cents of take-home pay for every dollar saved.
            </p>
          ) : (
            <p>There is no room to defer, so the whole payout is paid as cash.</p>
          )}
          <div className="keys">
            <KeyNumber
              label="Cash after tax, no deferral"
              value={k(l.without.netCash)}
              sub={`${k(l.without.incomeTax)} income tax, ${k(l.without.fica)} Social Security and Medicare`}
            />
            <KeyNumber
              label="With the deferral"
              value={`${k(l.withDeferral.netCash)} + ${k(l.withDeferral.deferred)}`}
              sub={`Cash after tax, plus ${k(l.withDeferral.deferred)} in your 457(b). About ${k(saved)} less income tax this year.`}
              tone={saved > 0 ? 'good' : undefined}
            />
          </div>
          <ShowMath>
            <Table
              caption={`Tax on the payout in ${year}`}
              head={['', 'No deferral', 'With deferral']}
              rows={[
                ['Payout', dollars(l.payout.total), dollars(l.payout.total)],
                ['Into the 457(b)', '$0', dollars(l.withDeferral.deferred)],
                ['Extra federal and Alabama income tax', dollars(l.without.incomeTax), dollars(l.withDeferral.incomeTax)],
                ['Social Security and Medicare', dollars(l.without.fica), dollars(l.withDeferral.fica)],
                ['Cash in hand', dollars(l.without.netCash), dollars(l.withDeferral.netCash)],
              ]}
            />
            <p className="hint">
              Income tax is the extra tax the payout adds on top of your {dollars(l.otherWages)} of pay and {dollars(l.otherPension)} of pension that calendar
              year. Alabama treatment of 457(b) deferrals is assumed to follow federal. All amounts are in {year} dollars.
            </p>
          </ShowMath>
        </li>

        <li>
          <h4>What to do before you retire</h4>
          <ul>
            <li>Call the City&apos;s deferred compensation plan. Ask whether it accepts leave payouts and ask for the deferral election form.</li>
            <li>
              Sign and return the form <strong>while you are still working</strong>, and before the first day of the month the payout is paid. If your payout
              comes in {ym(d)}, turn it in by the end of {ym(prior)} (26 CFR 1.457-4(b) and (d)).
            </li>
            <li>Make sure the payout is paid within 2½ months of your last day, or by December 31 of that year. Later payments can&apos;t be deferred.</li>
            <li>
              If you plan to use a catch-up, tell the plan which one. The plan has to offer the special 3-year catch-up and confirm which years you can use it.
            </li>
            <li>Lower your regular paycheck deferrals before you retire if you need to make room under the limit.</li>
            <li>Afterwards, check your final pay stub and your W-2 (box 12, code G) to confirm the amount went in.</li>
          </ul>
        </li>
      </ol>
      <Note>
        These are estimates. Your plan&apos;s rules decide what is allowed, so confirm with your deferred compensation plan and Human Resources before your last
        month.
      </Note>
    </Section>
  );
}
