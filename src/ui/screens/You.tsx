import { SCHEDULE, type ScenarioInputs } from '../../engine/model';
import { gradeOrder } from '../../engine/salary';
import { SHIFT_ACCRUAL_HOURS_PER_YEAR } from '../../engine/sickLeave';
import { MonthYearField, MoneyField, Note, NumberField, PercentField, Section, SelectField, Toggle } from '../components';
import { dollars } from '../format';

export type Setter = (update: (s: ScenarioInputs) => ScenarioInputs) => void;

export function You({ inputs, set }: { inputs: ScenarioInputs; set: Setter }) {
  const grades = gradeOrder(SCHEDULE);
  const steps = SCHEDULE.grades[inputs.pay.grade]?.length ?? 25;
  const promo = inputs.pay.promotions[0];
  const tier2 = inputs.member.tier === 'tier2';
  return (
    <div className="grid">
      <Section title="About you">
        <p className="lead">We only ask for month and year. Nothing you enter leaves this device.</p>
        <SelectField
          label="RSA tier"
          value={inputs.member.tier}
          options={[
            ['tier1', 'Tier I (hired before 2013)'],
            ['tier2-converted', 'Tier II with Tier I benefits (Huntsville, since 2021)'],
            ['tier2', 'Tier II'],
          ]}
          onChange={(tier) => set((s) => ({ ...s, member: { ...s.member, tier } }))}
          hint="Huntsville elected Tier I benefits for Tier II members under Act 2022-348."
        />
        <MonthYearField label="Birth month and year" value={inputs.member.birth} onChange={(birth) => set((s) => ({ ...s, member: { ...s.member, birth } }))} />
        <MonthYearField label="Hire month and year" value={inputs.member.hire} onChange={(hire) => set((s) => ({ ...s, member: { ...s.member, hire } }))} />
        <Toggle
          label="Stress bill credit applies"
          checked={inputs.member.stressCredit && !tier2}
          onChange={(stressCredit) => set((s) => ({ ...s, member: { ...s.member, stressCredit } }))}
          hint="One extra year per five years of firefighter service. It raises the benefit but does not count toward retirement eligibility. Not available to Tier II."
        />
        <SelectField
          label="Tax filing status"
          value={inputs.filing}
          options={[
            ['mfj', 'Married filing jointly'],
            ['single', 'Single'],
          ]}
          onChange={(filing) => set((s) => ({ ...s, filing }))}
        />
      </Section>

      <Section title="Pay">
        <p className="lead">From the FY{SCHEDULE.fiscalYear} public safety salary schedule, effective {SCHEDULE.effectiveDate}.</p>
        <div className="row">
          <SelectField label="Current grade" value={inputs.pay.grade} options={grades.map((g) => [g, g])} onChange={(grade) => set((s) => ({ ...s, pay: { ...s.pay, grade } }))} />
          <NumberField label="Current step" value={inputs.pay.step} min={1} max={steps} onChange={(step) => set((s) => ({ ...s, pay: { ...s.pay, step: Math.min(steps, Math.max(1, Math.round(step))) } }))} />
        </div>
        <p className="hint">
          Base pay at this grade and step: {dollars((SCHEDULE.grades[inputs.pay.grade]?.[inputs.pay.step - 1] ?? 0) * (1 + inputs.pay.missingColaPct))} a year,
          including the COLA below. You move up one step a year.
        </p>
        <PercentField
          label="Raise not yet in the schedule file"
          value={inputs.pay.missingColaPct}
          onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, missingColaPct: v } }))}
          hint="The FY2027 schedule file does not include the 2% COLA granted this year."
        />
        <PercentField label="Schedule COLA per year (assumed)" value={inputs.pay.scheduleColaPct} onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, scheduleColaPct: v } }))} />
        <PercentField
          label="Fitness incentive"
          value={inputs.pay.fitnessIncentivePct}
          onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, fitnessIncentivePct: v } }))}
          hint="5% of base pay while you pass the Physical Capabilities Drill (Personnel Manual 8.6(C))."
        />
        <NumberField
          label="Stop passing the drill in fiscal year (0 = never)"
          value={inputs.pay.fitnessStopsFiscalYear ?? 0}
          min={0}
          onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, fitnessStopsFiscalYear: v > 0 ? Math.round(v) : null } }))}
        />
        <MoneyField
          label="Overtime per year (today's dollars)"
          value={inputs.pay.overtimeAnnual}
          onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, overtimeAnnual: v } }))}
          hint="Counts toward RSA pay, but total pay counted is capped at 120% of base pay (125% for Tier II)."
        />
      </Section>

      <Section title="Promotion">
        <Toggle
          label="Plan a promotion"
          checked={!!promo}
          onChange={(on) =>
            set((s) => ({
              ...s,
              pay: { ...s.pay, promotions: on ? [{ grade: grades[Math.min(grades.length - 1, grades.indexOf(s.pay.grade) + 1)]!, fiscalYear: s.today.year + 3 }] : [] },
            }))
          }
        />
        {promo && (
          <>
            <div className="row">
              <SelectField
                label="Target grade"
                value={promo.grade}
                options={grades.filter((g) => grades.indexOf(g) > grades.indexOf(inputs.pay.grade)).map((g) => [g, g])}
                onChange={(grade) => set((s) => ({ ...s, pay: { ...s.pay, promotions: [{ ...promo, grade }] } }))}
              />
              <NumberField label="Fiscal year" value={promo.fiscalYear} onChange={(fiscalYear) => set((s) => ({ ...s, pay: { ...s.pay, promotions: [{ ...promo, fiscalYear: Math.round(fiscalYear) }] } }))} />
            </div>
            <PercentField
              label="Minimum raise per grade jumped"
              value={inputs.pay.promotionRaisePerGrade}
              onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, promotionRaisePerGrade: v } }))}
              hint="Personnel Manual 8.4(A): you land on the first step that gives at least 5% for each grade jumped."
            />
          </>
        )}
      </Section>

      <Section title="Sick leave">
        <NumberField label="Current balance (shift hours)" value={inputs.sickLeave.balanceHours} min={0} step={1} suffix="hours" onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, balanceHours: v } }))} />
        <NumberField
          label="Accrual per year (shift hours)"
          value={Math.round(inputs.sickLeave.accrualHoursPerYear * 10) / 10}
          min={0}
          step={0.1}
          suffix="hours"
          onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, accrualHoursPerYear: v } }))}
          hint={`Default ${SHIFT_ACCRUAL_HOURS_PER_YEAR.toFixed(1)} hours: 4 hours per pay period, scaled for a 2,912-hour year (Personnel Manual 10.7(D)). No cap.`}
        />
        <NumberField label="Hours used per year" value={inputs.sickLeave.usedHoursPerYear} min={0} suffix="hours" onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, usedHoursPerYear: v } }))} />
        <NumberField
          label="Hours per sick leave day"
          value={inputs.sickLeave.hoursPerDay}
          min={1}
          step={0.1}
          onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, hoursPerDay: v } }))}
          hint="11.2 fire suppression hours count as one 8-hour day."
        />
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
        <NumberField
          label="Most months of credit the city allows"
          value={inputs.sickLeave.capMonths}
          min={0}
          max={36}
          onChange={(v) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, capMonths: Math.round(v) } }))}
          hint="RSA's chart tops out at 36 months (730 days). Confirm the city's cap with Human Resources."
        />
        {tier2 && <Note kind="warn">Tier II members cannot convert sick leave to service credit (ERS Handbook p.21).</Note>}
      </Section>

      <Section title="Retirement">
        <NumberField
          label="Target years of service"
          value={inputs.retirement.targetServiceYears}
          min={10}
          max={40}
          onChange={(v) => set((s) => ({ ...s, retirement: { ...s.retirement, targetServiceYears: Math.round(v) } }))}
          hint="Counts actual service plus sick leave credit if you convert it. Stress credit does not count."
        />
        <Toggle
          label="Pick an exact retirement month instead"
          checked={!!inputs.retirement.dateOverride}
          onChange={(on) => set((s) => ({ ...s, retirement: { ...s.retirement, dateOverride: on ? { year: s.today.year + 10, month: 4 } : null } }))}
        />
        {inputs.retirement.dateOverride && (
          <MonthYearField label="Retirement month" value={inputs.retirement.dateOverride} onChange={(d) => set((s) => ({ ...s, retirement: { ...s.retirement, dateOverride: d } }))} />
        )}
        <MoneyField
          label="RSA account balance today (optional)"
          value={inputs.rsaAccountBalance ?? 0}
          onChange={(v) => set((s) => ({ ...s, rsaAccountBalance: v > 0 ? v : null }))}
          hint="Contributions plus interest from your RSA statement. Leave at 0 to estimate it."
        />
      </Section>
    </div>
  );
}
