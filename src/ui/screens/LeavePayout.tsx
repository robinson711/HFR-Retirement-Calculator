import { computeLeave, type PensionResult, type ScenarioInputs } from '../../engine/model';
import { WORK_SCHEDULES } from '../../engine/sickLeave';
import { KeyNumber, MoneyField, Note, NumberField, Section, ShowMath, Table, Toggle } from '../components';
import { dollars, k } from '../format';
import type { Setter } from './You';

const CATCH_UP_LABEL = {
  none: 'no catch-up (under 50)',
  age50: 'age 50 catch-up',
  age60to63: 'ages 60 to 63 catch-up',
  special: 'special 3-year catch-up',
} as const;

export function LeavePayout({ inputs, pension, set }: { inputs: ScenarioInputs; pension: PensionResult; set: Setter }) {
  const l = computeLeave(inputs, pension);
  const upd = (u: Partial<ScenarioInputs['leave']>) => set((s) => ({ ...s, leave: { ...s.leave, ...u } }));
  const schedule = WORK_SCHEDULES[inputs.sickLeave.workSchedule];
  const saved = l.without.incomeTax - l.withDeferral.incomeTax;
  return (
    <Section title="Other leave paid at retirement" who="you">
      <p className="lead">
        Annual, holiday and compensatory leave are paid at 100% of your hourly rate when you leave, up to each cap. Enter the balances you expect to have on
        your last day.
      </p>
      <div className="row wrap">
        <NumberField label="Annual leave" value={inputs.leave.annualHours} min={0} suffix="hours" onChange={(v) => upd({ annualHours: Math.max(0, v) })} />
        <NumberField label="Holiday leave" value={inputs.leave.holidayHours} min={0} suffix="hours" onChange={(v) => upd({ holidayHours: Math.max(0, v) })} />
        <NumberField label="Compensatory time" value={inputs.leave.compHours} min={0} suffix="hours" onChange={(v) => upd({ compHours: Math.max(0, v) })} />
      </div>
      <Table
        caption={`Payout in ${l.calendarYear} at ${dollars(l.hourlyRate)} an hour (final base pay ÷ ${schedule.hoursPerYear.toLocaleString()} hours)`}
        head={['Leave', 'Your hours', 'Paid up to', 'Paid hours', 'Payout']}
        rows={[
          ...l.payout.lines.map((x) => [x.label, String(Math.round(x.hours)), `${x.capHours} h`, String(Math.round(x.paidHours)), dollars(x.amount)]),
          ['Total', '', '', '', dollars(l.payout.total)],
        ]}
      />
      {l.payout.lines.some((x) => x.hours > x.capHours) && <Note kind="warn">Hours above a cap are not paid. Use them before you retire if you can.</Note>}

      <h3>Put part of it in your 457(b)</h3>
      <Toggle
        label="Defer part of the payout into my traditional 457(b)"
        checked={inputs.leave.defer}
        onChange={(defer) => upd({ defer })}
        hint="IRS rules allow it if your plan does and the payout comes within 2½ months of your last day (or by year end). Confirm with your deferred compensation plan before you count on it."
      />
      <Toggle
        label="I'm in the last 3 years before my plan's normal retirement age"
        checked={inputs.leave.specialCatchUp}
        onChange={(specialCatchUp) => upd({ specialCatchUp })}
        hint="Unlocks the 457(b) special catch-up: up to twice the yearly limit, if you have unused limit from earlier years. It can't be combined with the age 50 catch-up; the larger one applies. Your plan sets the normal retirement age."
      />
      {inputs.leave.specialCatchUp && (
        <MoneyField
          label="Unused limit from earlier years"
          value={inputs.leave.underusedPriorYears}
          step={1000}
          onChange={(underusedPriorYears) => upd({ underusedPriorYears })}
          hint="The total of each past year's limit minus what you deferred. Your plan administrator can calculate it."
        />
      )}
      {inputs.leave.defer && (
        <MoneyField
          label="Amount to defer (0 = as much as allowed)"
          value={inputs.leave.deferAmount}
          step={500}
          onChange={(deferAmount) => upd({ deferAmount })}
        />
      )}
      <p className="total-line">
        {l.calendarYear} limit: {dollars(l.room.limit)} plus {dollars(l.room.catchUp)} ({CATCH_UP_LABEL[l.room.catchUpKind]}) = <strong>{dollars(l.room.yearMax)}</strong>.
        You will have deferred about {dollars(l.alreadyDeferred)} from pay before you retire, leaving <strong>{dollars(l.room.room)}</strong> for the payout.
        {l.room.estimatedLimits ? ` IRS limits after 2027 are estimates grown with inflation.` : ''}
      </p>
      {l.room.catchUpMustBeRoth && (
        <Note kind="warn">
          Your pay the year before you retire is above {dollars(l.room.rothThreshold)}, so the IRS requires age-based catch-up contributions to be Roth (taxed now). The app
          treats the whole deferral as pre-tax, so the tax savings shown on the catch-up part are too high. The special 3-year catch-up can still be pre-tax.
        </Note>
      )}

      <div className="keys">
        <KeyNumber label="Cash after tax, no deferral" value={k(l.without.netCash)} sub={`${k(l.without.incomeTax)} income tax, ${k(l.without.fica)} Social Security and Medicare`} />
        <KeyNumber
          label="With the deferral"
          value={`${k(l.withDeferral.netCash)} + ${k(l.withDeferral.deferred)}`}
          sub={`Cash after tax, plus ${k(l.withDeferral.deferred)} in your 457(b). About ${k(saved)} less income tax this year.`}
          tone={saved > 0 ? 'good' : undefined}
        />
      </div>
      <ShowMath>
        <Table
          caption={`Tax on the payout in ${l.calendarYear}`}
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
          Income tax is the extra tax the payout adds on top of your {dollars(l.otherWages)} of pay and {dollars(l.otherPension)} of pension that calendar year.
          457(b) deferrals still owe Social Security and Medicare tax. Alabama treatment of 457(b) deferrals is assumed to follow federal. All amounts are in{' '}
          {l.calendarYear} dollars.
        </p>
      </ShowMath>
    </Section>
  );
}
