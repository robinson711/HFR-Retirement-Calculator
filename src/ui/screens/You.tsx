import { SCHEDULE, type ScenarioInputs } from '../../engine/model';
import { basePay, gradeOrder, PROMOTION_RAISE_PER_GRADE, salaryPath, type Promotion } from '../../engine/salary';
import { fiscalYearOf } from '../../engine/service';
import { WORK_SCHEDULES, type WorkSchedule } from '../../engine/sickLeave';
import { MonthYearField, MoneyField, Note, NumberField, PercentField, Section, SelectField, Toggle } from '../components';
import { dollars, pct } from '../format';

/** Today's rates: the schedule file plus the raise it does not show yet. */
const todayScale = 1 + (SCHEDULE.colaNotInSchedule ?? 0);
const MAX_PROMOTIONS = 4;

export type Setter = (update: (s: ScenarioInputs) => ScenarioInputs) => void;

export function You({ inputs, set }: { inputs: ScenarioInputs; set: Setter }) {
  const grades = gradeOrder(SCHEDULE);
  const steps = SCHEDULE.grades[inputs.pay.grade]?.length ?? 25;
  const tier2 = inputs.member.tier === 'tier2';
  return (
    <div className="grid">
      <Section title="About you" who="you">
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
        <MonthYearField
          label="RSA service start (month and year)"
          value={inputs.member.hire}
          onChange={(hire) => set((s) => ({ ...s, member: { ...s.member, hire } }))}
          hint="Usually your hire month, but RSA may start counting a month or two later, when contributions began. Use the date from your RSA statement or estimate letter if you have it."
        />
        <Toggle
          label="Stress bill credit applies"
          checked={inputs.member.stressCredit && !tier2}
          onChange={(stressCredit) => set((s) => ({ ...s, member: { ...s.member, stressCredit } }))}
          hint="One extra year per five years of firefighter service. It raises the benefit but does not count toward retirement eligibility."
        />
        <SelectField
          id="work-schedule"
          label="Work schedule"
          value={inputs.sickLeave.workSchedule}
          options={Object.entries(WORK_SCHEDULES).map(([k, v]) => [k as WorkSchedule, v.label])}
          onChange={(workSchedule) => set((s) => ({ ...s, sickLeave: { ...s.sickLeave, workSchedule } }))}
          hint={
            inputs.sickLeave.workSchedule === 'fireSuppression'
              ? 'Set it once here; the whole app uses it. Fire suppression: hourly rate = base pay ÷ 2,912 hours; sick leave accrues 145.6 hours a year and 11.2 hours count as a day (10.7(D)); leave payout caps are 364 annual, 336 holiday and 336 comp hours.'
              : 'Set it once here; the whole app uses it. 40-hour: hourly rate = base pay ÷ 2,080 hours; sick leave accrues 104 hours a year and 8 hours make a day (10.7(D)); leave payout caps are 260 annual, 240 holiday and 240 comp hours.'
          }
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

      <Section title="Pay" who="you">
        <p className="lead">
          From the FY{SCHEDULE.fiscalYear} public safety salary schedule, effective {SCHEDULE.effectiveDate}, plus the {pct(todayScale - 1, 0)} raise granted this year that the
          schedule file does not show yet.
        </p>
        <div className="row">
          <SelectField label="Current grade" value={inputs.pay.grade} options={grades.map((g) => [g, g])} onChange={(grade) => set((s) => ({ ...s, pay: { ...s.pay, grade, promotions: [] } }))} />
          <NumberField label="Current step" value={inputs.pay.step} min={1} max={steps} onChange={(step) => set((s) => ({ ...s, pay: { ...s.pay, step: Math.min(steps, Math.max(1, Math.round(step))) } }))} />
        </div>
        <p className="hint">
          Base pay at this grade and step: {dollars(basePay(SCHEDULE, inputs.pay.grade, inputs.pay.step, todayScale))} a year. You move up one step a year on your anniversary date.
        </p>
        <PercentField label="Schedule COLA per year (assumed)" value={inputs.pay.scheduleColaPct} onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, scheduleColaPct: v } }))} />
        <Toggle
          label="Fitness incentive (5% of base pay)"
          checked={inputs.pay.fitnessIncentive}
          onChange={(fitnessIncentive) => set((s) => ({ ...s, pay: { ...s.pay, fitnessIncentive } }))}
          hint="Paid for passing the Physical Capabilities Drill (Personnel Manual 8.6(C))."
        />
        <MoneyField
          label="Overtime per year (today's dollars)"
          value={inputs.pay.overtimeAnnual}
          onChange={(v) => set((s) => ({ ...s, pay: { ...s.pay, overtimeAnnual: v } }))}
          hint="Counts toward RSA pay, but total pay counted is capped at 120% of base pay (125% for Tier II)."
        />
      </Section>

      <Promotions inputs={inputs} set={set} />

      <Section title="Retirement" who="you">
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

interface PromotionResult {
  promotion: Promotion;
  fromGrade: string;
  fromStep: number;
  toStep: number;
  jumped: number;
}

/** Where each planned promotion lands, using the same salary path the pension uses. */
function promotionResults(inputs: ScenarioInputs): Array<PromotionResult | null> {
  const promos = inputs.pay.promotions;
  if (promos.length === 0) return [];
  const currentFiscalYear = fiscalYearOf(inputs.today);
  const end = Math.max(currentFiscalYear, ...promos.map((p) => p.fiscalYear));
  const path = salaryPath(SCHEDULE, { ...inputs.pay, currentFiscalYear, cityServiceMonthsAtStart: 0, longevityPerMonth: 0 }, end);
  const grades = gradeOrder(SCHEDULE);
  return promos.map((promotion) => {
    const y = path.find((r) => r.fiscalYear === promotion.fiscalYear && r.promotedFrom && r.grade === promotion.grade);
    if (!y?.promotedFrom) return null;
    return {
      promotion,
      fromGrade: y.promotedFrom.grade,
      fromStep: y.promotedFrom.step,
      toStep: y.step,
      jumped: grades.indexOf(y.grade) - grades.indexOf(y.promotedFrom.grade),
    };
  });
}

function Promotions({ inputs, set }: { inputs: ScenarioInputs; set: Setter }) {
  const grades = gradeOrder(SCHEDULE);
  const promos = inputs.pay.promotions;
  const firstFY = fiscalYearOf(inputs.today);
  const results = promotionResults(inputs);
  const gradeBefore = (i: number) => (i === 0 ? inputs.pay.grade : promos[i - 1]!.grade);
  const yearAfter = (i: number) => (i === 0 ? firstFY : promos[i - 1]!.fiscalYear + 1);
  const update = (next: Promotion[]) => set((s) => ({ ...s, pay: { ...s.pay, promotions: next } }));
  /** Keep later promotions valid: each one above the grade before it, in a later fiscal year. */
  const tidy = (list: Promotion[]): Promotion[] => {
    const out: Promotion[] = [];
    for (const p of list) {
      const prevGrade = out.length ? out[out.length - 1]!.grade : inputs.pay.grade;
      const minFY = out.length ? out[out.length - 1]!.fiscalYear + 1 : firstFY;
      if (grades.indexOf(p.grade) <= grades.indexOf(prevGrade)) break;
      out.push({ grade: p.grade, fiscalYear: Math.max(minFY, p.fiscalYear) });
    }
    return out;
  };
  const lastGrade = promos.length ? promos[promos.length - 1]!.grade : inputs.pay.grade;
  const canAdd = promos.length < MAX_PROMOTIONS && grades.indexOf(lastGrade) < grades.length - 1;
  const add = () => {
    const next = grades[grades.indexOf(lastGrade) + 1]!;
    const fy = promos.length ? promos[promos.length - 1]!.fiscalYear + 3 : firstFY + 3;
    update([...promos, { grade: next, fiscalYear: fy }]);
  };

  return (
    <Section title="Promotions" who="you">
      <p className="lead">
        Personnel Manual 8.4(A): on promotion you move to the first step of the new grade that pays at least {pct(PROMOTION_RAISE_PER_GRADE, 0)} more for each grade you
        jump, or step 1 if that is higher. Your anniversary date stays the same, so you keep moving up one step a year (8.4(C)).
      </p>
      {promos.length === 0 && <p className="hint">No promotions planned. Add one to see which step you land on and how it changes your pension.</p>}
      {promos.map((promo, i) => {
        const r = results[i];
        const before = gradeBefore(i);
        const options = grades.filter((g) => grades.indexOf(g) > grades.indexOf(before)).map((g) => [g, g] as [string, string]);
        const fromPay = r ? basePay(SCHEDULE, r.fromGrade, r.fromStep, todayScale) : 0;
        const toPay = r ? basePay(SCHEDULE, promo.grade, r.toStep, todayScale) : 0;
        return (
          <fieldset className="promotion" key={i}>
            <legend>Promotion {i + 1}</legend>
            <div className="row">
              <SelectField
                label="To grade"
                value={promo.grade}
                options={options}
                onChange={(grade) => update(tidy(promos.map((p, j) => (j === i ? { ...p, grade } : p))))}
              />
              <NumberField
                label="In fiscal year (Oct to Sep)"
                value={promo.fiscalYear}
                min={yearAfter(i)}
                max={firstFY + 40}
                onChange={(v) => update(tidy(promos.map((p, j) => (j === i ? { ...p, fiscalYear: Math.max(yearAfter(i), Math.round(v)) } : p))))}
              />
            </div>
            {r ? (
              <p className="promotion-result">
                In FY{promo.fiscalYear} you would be at {r.fromGrade} step {r.fromStep} ({dollars(fromPay)}). Jumping {r.jumped} grade{r.jumped > 1 ? 's' : ''} needs at least{' '}
                {pct(PROMOTION_RAISE_PER_GRADE * r.jumped, 0)} more ({dollars(fromPay * (1 + PROMOTION_RAISE_PER_GRADE * r.jumped))}), so you land on{' '}
                <strong>
                  {promo.grade} step {r.toStep}
                </strong>{' '}
                at {dollars(toPay)}, a {pct(toPay / fromPay - 1, 1)} raise. Pay shown at today&apos;s rates.
              </p>
            ) : (
              <Note kind="warn">This promotion could not be placed. Check the grade and fiscal year.</Note>
            )}
            <button type="button" className="link-button" onClick={() => update(tidy(promos.filter((_, j) => j !== i)))}>
              Remove promotion {i + 1}
            </button>
          </fieldset>
        );
      })}
      {canAdd && (
        <button type="button" className="button secondary" onClick={add}>
          Add a promotion
        </button>
      )}
    </Section>
  );
}
