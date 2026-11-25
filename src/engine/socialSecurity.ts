// Social Security retirement benefit: a rough estimator and the claiming-age adjustment.
// Sources (src/rules/social-security.json):
//  - PIA formula: 90% / 32% / 15% of average indexed monthly earnings (AIME) split at the bend points,
//    AIME from the highest 35 years of earnings: SSA Annual Statistical Supplement, Appendix C.
//  - 2026 bend points $1,286 and $7,749; 2026 taxable maximum $184,500: SSA.
//  - Full retirement age 67 for people born 1960 or later: SSA, Normal Retirement Age.
//  - Claiming early: 5/9 of 1% per month for the first 36 months, 5/12 of 1% beyond; claiming late: 8% a year
//    up to 70: SSA, Early or Late Retirement.
// The estimator works in today's dollars: earnings are today's wages and the formula uses this year's figures,
// which approximates SSA's wage indexing. It is a rough estimate. The SSA statement is the real figure.
import { ruleValue } from './rules';

export interface PiaEstimate {
  /** Average indexed monthly earnings, today's dollars. */
  aime: number;
  /** Monthly benefit at full retirement age, today's dollars. */
  pia: number;
  yearsWithEarnings: number;
}

/** Estimate the full-retirement-age benefit from yearly earnings in today's dollars. */
export function estimatePia(earnings: number[]): PiaEstimate {
  const cap = ruleValue<number>('social-security:taxableMax');
  const years = ruleValue<number>('social-security:computationYears');
  const [b1, b2] = ruleValue<[number, number]>('social-security:bendPoints');
  const [r1, r2, r3] = ruleValue<[number, number, number]>('social-security:pia.rates');
  const counted = earnings
    .map((e) => Math.min(Math.max(0, e), cap))
    .sort((a, b) => b - a)
    .slice(0, years);
  const aime = Math.floor(counted.reduce((s, e) => s + e, 0) / (years * 12));
  const pia = r1 * Math.min(aime, b1) + r2 * Math.max(0, Math.min(aime, b2) - b1) + r3 * Math.max(0, aime - b2);
  return { aime, pia: Math.floor(pia * 10) / 10, yearsWithEarnings: counted.filter((e) => e > 0).length };
}

/** Full retirement age in months, by birth year (SSA, Normal Retirement Age). */
export function fullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1937) return 65 * 12;
  if (birthYear <= 1942) return 65 * 12 + 2 * (birthYear - 1937);
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear <= 1959) return 66 * 12 + 2 * (birthYear - 1954);
  return ruleValue<number>('social-security:fullRetirementAge') * 12;
}

/** Multiply the full-retirement-age benefit by this to get the benefit when claimed at claimAge (62 to 70). */
export function claimingFactor(birthYear: number, claimAge: number): number {
  const fra = fullRetirementAgeMonths(birthYear);
  const claim = Math.min(70, Math.max(62, claimAge)) * 12;
  if (claim < fra) {
    const [first, beyond] = ruleValue<[number, number]>('social-security:earlyReduction');
    const early = fra - claim;
    return 1 - first * Math.min(36, early) - beyond * Math.max(0, early - 36);
  }
  return 1 + (ruleValue<number>('social-security:delayedCredit') / 12) * (claim - fra);
}
