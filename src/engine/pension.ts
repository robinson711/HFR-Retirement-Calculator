// RSA ERS pension formula.
// ERS Handbook p.24 (Tier 1) and p.25 (Tier 2):
//   Average Final Salary x Years and Months of Service x Benefit Factor / 12 = Maximum Monthly Benefit
// Tier 1 (and converted Tier 2, Act 2022-348): 2.0125%, highest 3 of the last 10 fiscal years.
// Tier 2: 1.65%, highest 5 of the last 10 fiscal years, capped at 80% of average final salary.
import { ruleValue } from './rules';
import { capEarnable, type SalaryYear } from './salary';
import { usesTier1Rules, type Tier } from './service';

export interface TierRules {
  benefitFactor: number;
  afsYears: number;
  earnableCap: number;
  benefitCap: number | null;
  contributionRate: number;
}

export function tierRules(tier: Tier): TierRules {
  if (usesTier1Rules(tier)) {
    return {
      benefitFactor: ruleValue('rsa-ers:tier1.benefitFactor'),
      afsYears: ruleValue('rsa-ers:tier1.afsYears'),
      earnableCap: ruleValue('rsa-ers:tier1.earnableCap'),
      benefitCap: null,
      contributionRate: ruleValue('rsa-ers:tier1.contributionFLC'),
    };
  }
  return {
    benefitFactor: ruleValue('rsa-ers:tier2.benefitFactor'),
    afsYears: ruleValue('rsa-ers:tier2.afsYears'),
    earnableCap: ruleValue('rsa-ers:tier2.earnableCap'),
    benefitCap: ruleValue('rsa-ers:tier2.benefitCap'),
    contributionRate: ruleValue('rsa-ers:tier2.contributionFLC'),
  };
}

/**
 * Average final salary: the average of the highest N fiscal years out of the last 10 with contributions.
 * `years` must be complete fiscal years ending at retirement; the last 10 are used.
 */
export function averageFinalSalary(years: Array<Pick<SalaryYear, 'earnable'>>, afsYears: number): number {
  const last10 = years.slice(-10).map((y) => y.earnable);
  if (last10.length === 0) return 0;
  const top = [...last10].sort((a, b) => b - a).slice(0, afsYears);
  return top.reduce((s, v) => s + v, 0) / top.length;
}

export interface MaximumBenefit {
  afs: number;
  creditedMonths: number;
  factor: number;
  /** Before any cap or early-retirement reduction. */
  formulaMonthly: number;
  monthly: number;
  capped: boolean;
  reduction: number;
}

/** Maximum monthly benefit from average final salary and credited service in months. */
export function maximumMonthly(afs: number, creditedMonths: number, rules: TierRules, earlyReduction = 0): MaximumBenefit {
  const formulaMonthly = (afs * (creditedMonths / 12) * rules.benefitFactor) / 12;
  const capMonthly = rules.benefitCap === null ? Infinity : (afs * rules.benefitCap) / 12;
  const capped = formulaMonthly > capMonthly;
  const monthly = Math.min(formulaMonthly, capMonthly) * (1 - earlyReduction);
  return { afs, creditedMonths, factor: rules.benefitFactor, formulaMonthly, monthly, capped, reduction: earlyReduction };
}

/** Convenience: AFS from a salary path (applies the earnable cap) and the maximum benefit. */
export function pensionFromSalary(
  tier: Tier,
  salaryYears: SalaryYear[],
  creditedMonths: number,
  earlyReduction = 0,
): MaximumBenefit {
  const rules = tierRules(tier);
  const afs = averageFinalSalary(capEarnable(salaryYears, rules.earnableCap), rules.afsYears);
  return maximumMonthly(afs, creditedMonths, rules, earlyReduction);
}

/** Member contributions with interest credited annually (an estimate; RSA credits interest on the account). */
export function accumulatedContributions(
  salaryYears: Array<Pick<SalaryYear, 'earnable'>>,
  rate: number,
  priorBalance = 0,
  interest = ruleValue<number>('rsa-ers:contributions.interestRate'),
): number {
  return salaryYears.reduce((bal, y) => bal * (1 + interest) + y.earnable * rate, priorBalance);
}
