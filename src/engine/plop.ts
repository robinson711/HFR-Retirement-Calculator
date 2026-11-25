// Partial Lump Sum Option Plan (PLOP). ERS Handbook pp.27-29:
//  - Lump sum of 1 to 24 months of the Maximum monthly benefit, in $1,000 increments
//    (minimum rounded up, maximum rounded down to the nearest $1,000).
//  - The monthly benefit is reduced for life by a per-$1,000 amount from the Benefit Reduction Table, by age
//    at retirement. Table amounts are for the Maximum option; other options differ, so users can enter the
//    reduction from their RSA estimate letter instead.
import { ruleValue } from './rules';

export function plopLimits(maximumMonthly: number): { min: number; max: number } {
  const maxMonths = ruleValue<number>('rsa-ers:plop.maxMonths');
  return {
    min: Math.ceil(maximumMonthly / 1000) * 1000,
    max: Math.floor((maximumMonthly * maxMonths) / 1000) * 1000,
  };
}

/** Lump sum for a number of months (1-24), rounded down to $1,000 and kept within the limits. */
export function plopAmountForMonths(maximumMonthly: number, months: number): number {
  if (months <= 0) return 0;
  const { min, max } = plopLimits(maximumMonthly);
  const raw = Math.floor((maximumMonthly * months) / 1000) * 1000;
  return Math.min(max, Math.max(min, raw));
}

/** Reduction per $1,000, by whole age at retirement. Ages outside the table use the nearest end. */
export function plopReductionPer1000(ageYears: number): number {
  const table = ruleValue<Record<string, number>>('rsa-ers:plop.reductionPer1000');
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
  const age = Math.min(Math.max(Math.floor(ageYears), ages[0]!), ages[ages.length - 1]!);
  return table[String(age)]!;
}

export interface PlopResult {
  lumpSum: number;
  monthlyReduction: number;
  reducedMonthly: number;
  per1000: number;
}

export function applyPlop(maximumMonthly: number, lumpSum: number, ageYears: number, per1000Override?: number): PlopResult {
  const per1000 = per1000Override ?? plopReductionPer1000(ageYears);
  const monthlyReduction = (lumpSum / 1000) * per1000;
  return { lumpSum, monthlyReduction, reducedMonthly: maximumMonthly - monthlyReduction, per1000 };
}

/**
 * PLOP break-even: the annual return the lump sum must earn so that withdrawing `monthlyReduction` each month
 * lasts exactly `months` (e.g. to life expectancy). Solved by bisection on the annuity formula.
 */
export function plopBreakEvenReturn(lumpSum: number, monthlyReduction: number, months: number): number {
  if (lumpSum <= 0 || monthlyReduction <= 0 || months <= 0) return 0;
  const pv = (annual: number) => {
    const r = Math.pow(1 + annual, 1 / 12) - 1;
    return r === 0 ? monthlyReduction * months : (monthlyReduction * (1 - Math.pow(1 + r, -months))) / r;
  };
  let lo = -0.99;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > lumpSum) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
