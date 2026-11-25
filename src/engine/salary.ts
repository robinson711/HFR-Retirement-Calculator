// Salary path: year-by-year pay from the City of Huntsville public safety schedule.
// Sources:
//  - Step progression, one step per year on the anniversary date: Personnel Manual 8.7(A)(1).
//  - Promotion placement: Personnel Manual 8.4(A): the new step is the minimum step of the new grade, or the
//    first step giving at least 5% for each grade jumped, whichever is higher. The percent is editable.
//  - Fitness incentive: 5% of base (grade and step) while passing the Physical Capabilities Drill: Manual 8.6(C).
//  - Longevity pay: $5.25 per month of continuous service ($63 per year): Manual 8.19.
//  - Earnable compensation for RSA is capped at 120% (Tier 1) or 125% (Tier 2) of base pay: ERS Handbook p.8.
// The model works in City fiscal years (October-September), matching RSA's salary averaging.

export interface SalarySchedule {
  fiscalYear: number;
  effectiveDate: string;
  hoursPerYearFireSuppression: number;
  grades: Record<string, number[]>;
}

export interface Promotion {
  grade: string;
  fiscalYear: number;
}

export interface PayInputs {
  grade: string;
  /** 1-based step in the current fiscal year. */
  step: number;
  /** Fiscal year the member is in now (the schedule's year unless told otherwise). */
  currentFiscalYear: number;
  /** A raise already granted but missing from the schedule file (e.g. 0.02). */
  missingColaPct: number;
  /** Assumed annual schedule COLA going forward (e.g. 0.02). */
  scheduleColaPct: number;
  /** Fitness incentive as a fraction of base (default 0.05). */
  fitnessIncentivePct: number;
  /** First fiscal year the member no longer passes the drill (incentive stops). null = keeps passing. */
  fitnessStopsFiscalYear: number | null;
  /** Overtime and other pensionable extra pay in today's dollars per year; grows with the schedule COLA. */
  overtimeAnnual: number;
  /** Whether overtime counts toward RSA earnable compensation (Huntsville: yes, per user). */
  overtimePensionable: boolean;
  /** Months of continuous City service at the start of the current fiscal year (for longevity pay). */
  cityServiceMonthsAtStart: number;
  longevityPerMonth: number;
  promotions: Promotion[];
  /** Raise required per grade jumped on promotion (Personnel Manual 8.4(A): 5%). */
  promotionRaisePerGrade: number;
}

export interface SalaryYear {
  fiscalYear: number;
  grade: string;
  step: number;
  base: number;
  incentive: number;
  overtime: number;
  longevity: number;
  /** All pay. */
  gross: number;
  /** Pay counted by RSA after the earnable-compensation cap. */
  earnable: number;
  promoted: boolean;
}

export function gradeOrder(schedule: SalarySchedule): string[] {
  return Object.keys(schedule.grades).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function scheduleScale(inputs: Pick<PayInputs, 'missingColaPct' | 'scheduleColaPct'>, schedule: SalarySchedule, fiscalYear: number): number {
  const years = Math.max(0, fiscalYear - schedule.fiscalYear);
  return (1 + inputs.missingColaPct) * Math.pow(1 + inputs.scheduleColaPct, years);
}

export function basePay(schedule: SalarySchedule, grade: string, step: number, scale: number): number {
  const row = schedule.grades[grade];
  if (!row) throw new Error(`Grade ${grade} is not in the salary schedule`);
  const s = Math.min(Math.max(step, 1), row.length);
  return row[s - 1]! * scale;
}

/**
 * Personnel Manual 8.4(A): the new step is the first step of the new grade whose pay is at least
 * (1 + raisePerGrade x gradesJumped) times the old base pay, or step 1 if that is higher. If no step is high
 * enough, the top step.
 */
export function promotionStep(
  schedule: SalarySchedule,
  fromGrade: string,
  fromStep: number,
  toGrade: string,
  raisePerGrade: number,
): number {
  const order = gradeOrder(schedule);
  const jumped = order.indexOf(toGrade) - order.indexOf(fromGrade);
  if (jumped <= 0) throw new Error('A promotion must be to a higher grade');
  const target = basePay(schedule, fromGrade, fromStep, 1) * (1 + raisePerGrade * jumped);
  const row = schedule.grades[toGrade]!;
  // A tiny tolerance avoids skipping a step that meets the target to the cent.
  const idx = row.findIndex((pay) => pay >= target - 0.005);
  return idx === -1 ? row.length : idx + 1;
}

export function salaryPath(schedule: SalarySchedule, inputs: PayInputs, endFiscalYear: number): SalaryYear[] {
  const years: SalaryYear[] = [];
  let grade = inputs.grade;
  let step = inputs.step;
  const maxSteps = (g: string) => schedule.grades[g]!.length;
  for (let fy = inputs.currentFiscalYear; fy <= endFiscalYear; fy++) {
    let promoted = false;
    if (fy > inputs.currentFiscalYear) step = Math.min(step + 1, maxSteps(grade));
    const promo = inputs.promotions.find((p) => p.fiscalYear === fy);
    if (promo && promo.grade !== grade) {
      step = promotionStep(schedule, grade, step, promo.grade, inputs.promotionRaisePerGrade);
      grade = promo.grade;
      promoted = true;
    }
    const scale = scheduleScale(inputs, schedule, fy);
    const base = basePay(schedule, grade, step, scale);
    const passing = inputs.fitnessStopsFiscalYear === null || fy < inputs.fitnessStopsFiscalYear;
    const incentive = passing ? base * inputs.fitnessIncentivePct : 0;
    const colaGrowth = Math.pow(1 + inputs.scheduleColaPct, fy - inputs.currentFiscalYear);
    const overtime = inputs.overtimeAnnual * colaGrowth;
    const serviceMonths = inputs.cityServiceMonthsAtStart + 12 * (fy - inputs.currentFiscalYear);
    const longevity = serviceMonths >= 12 ? inputs.longevityPerMonth * serviceMonths : 0;
    const gross = base + incentive + overtime + longevity;
    years.push({
      fiscalYear: fy,
      grade,
      step,
      base,
      incentive,
      overtime,
      longevity,
      gross,
      earnable: inputs.overtimePensionable ? gross : gross - overtime,
      promoted,
    });
  }
  return years;
}

/** Apply RSA's earnable-compensation cap (a multiple of base pay). */
export function capEarnable(years: SalaryYear[], capMultiple: number): SalaryYear[] {
  return years.map((y) => ({ ...y, earnable: Math.min(y.earnable, y.base * capMultiple) }));
}
