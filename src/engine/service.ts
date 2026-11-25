// Service credit: actual service, converted sick leave, and stress bill (hazardous duty) credit.
import { ruleValue } from './rules';

/** Month index for date math: year x 12 + (month - 1). Months are 1-12. */
export interface YearMonth {
  year: number;
  month: number;
}
export const toIndex = (d: YearMonth) => d.year * 12 + (d.month - 1);
export const fromIndex = (i: number): YearMonth => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
export const monthsBetween = (from: YearMonth, to: YearMonth) => toIndex(to) - toIndex(from);
/** City and RSA fiscal year: October starts the next fiscal year (Oct 2026 = FY2027). */
export const fiscalYearOf = (d: YearMonth) => (d.month >= 10 ? d.year + 1 : d.year);

export type Tier = 'tier1' | 'tier2' | 'tier2-converted';
/** Converted Tier 2 members (Act 2022-348) get Tier 1 benefits. */
export const usesTier1Rules = (tier: Tier) => tier !== 'tier2';

/**
 * ERS Handbook p.22 conversion chart: 0-10 days = 0 months, 11-30 = 1 month, then one more month per
 * 20 days, up to 711-730 days = 36 months. The employer sets the maximum days (capMonths).
 */
export function sickLeaveCreditMonths(days: number, capMonths?: number): number {
  const perMonth = ruleValue<number>('rsa-ers:sickLeave.daysPerMonth');
  const chartMax = ruleValue<number>('rsa-ers:sickLeave.chartMaxMonths');
  const whole = Math.floor(days);
  const months = whole <= 10 ? 0 : Math.ceil((whole - 10) / perMonth);
  return Math.min(months, chartMax, capMonths ?? Infinity);
}

/** Days needed for a number of months of credit (the bottom of the chart row). */
export function sickLeaveDaysForMonths(months: number): number {
  return months <= 0 ? 0 : 11 + (months - 1) * ruleValue<number>('rsa-ers:sickLeave.daysPerMonth');
}

/**
 * Convert a shift worker's sick leave hours to RSA days. Per the user (Huntsville), 11.2 fire suppression
 * hours count as one 8-hour day.
 */
export function shiftHoursToDays(hours: number, hoursPerDay = 11.2): number {
  return hours / hoursPerDay;
}

/**
 * Stress bill credit: one year per five years of firefighter service (ERS Handbook pp.12, 23), figured on
 * actual service only, excluding converted sick leave (per the user). Prorated and rounded to the nearest
 * month, which reproduces the user's RSA estimate letter (24y11m actual -> 29y11m total).
 */
export function stressCreditMonths(actualServiceMonths: number): number {
  const perYear = ruleValue<number>('rsa-ers:stress.yearsPerBonusYear');
  return Math.round(actualServiceMonths / perYear);
}

export interface ServiceInputs {
  tier: Tier;
  hire: YearMonth;
  birth: YearMonth;
  stressCredit: boolean;
  /** Months of sick leave credit converted at retirement (0 if taking cash). */
  sickLeaveMonths: number;
}

export interface ServiceAt {
  actualMonths: number;
  sickLeaveMonths: number;
  stressMonths: number;
  /** Counts toward eligibility: actual + sick leave (Tier 1 rules). */
  eligibilityMonths: number;
  /** Used in the benefit formula. */
  creditedMonths: number;
  ageMonths: number;
}

export function serviceAt(inputs: ServiceInputs, date: YearMonth): ServiceAt {
  const actualMonths = Math.max(0, monthsBetween(inputs.hire, date));
  const tier1 = usesTier1Rules(inputs.tier);
  // Sick leave conversion and stress credit are Tier 1 only (ERS Handbook pp.21, 23).
  const sickLeaveMonths = tier1 ? inputs.sickLeaveMonths : 0;
  const stressMonths = tier1 && inputs.stressCredit ? stressCreditMonths(actualMonths) : 0;
  return {
    actualMonths,
    sickLeaveMonths,
    stressMonths,
    eligibilityMonths: actualMonths + sickLeaveMonths,
    creditedMonths: actualMonths + sickLeaveMonths + stressMonths,
    ageMonths: monthsBetween(inputs.birth, date),
  };
}

export interface Eligibility {
  eligible: boolean;
  /** Fraction the benefit is reduced for early retirement (Tier 2 30-year rule), 0 if none. */
  reduction: number;
  reason: string;
}

/** Service retirement eligibility, ERS Handbook p.18. */
export function eligibility(tier: Tier, s: ServiceAt): Eligibility {
  const years = s.eligibilityMonths / 12;
  const age = s.ageMonths / 12;
  const minYears = ruleValue<number>('rsa-ers:minServiceYears');
  if (usesTier1Rules(tier)) {
    const anyAge = ruleValue<number>('rsa-ers:tier1.serviceAnyAge');
    const ageTen = ruleValue<number>('rsa-ers:tier1.ageWithTen');
    if (years >= anyAge) return { eligible: true, reduction: 0, reason: `${anyAge} years of service at any age` };
    if (age >= ageTen && years >= minYears) return { eligible: true, reduction: 0, reason: `Age ${ageTen} with ${minYears} years` };
    return { eligible: false, reduction: 0, reason: `Needs ${anyAge} years of service, or age ${ageTen} with ${minYears} years` };
  }
  const ageFLC = ruleValue<number>('rsa-ers:tier2.ageFLC');
  const reduced = ruleValue<{ years: number; reductionPerYear: number }>('rsa-ers:tier2.serviceReduced');
  if (age >= ageFLC && years >= minYears) return { eligible: true, reduction: 0, reason: `Age ${ageFLC} with ${minYears} years` };
  if (years >= reduced.years) {
    const yearsEarly = Math.ceil(ageFLC - age);
    return {
      eligible: true,
      reduction: Math.min(1, yearsEarly * reduced.reductionPerYear),
      reason: `${reduced.years} years of service, reduced ${reduced.reductionPerYear * 100}% per year under age ${ageFLC}`,
    };
  }
  return { eligible: false, reduction: 0, reason: `Needs age ${ageFLC} with ${minYears} years, or ${reduced.years} years (reduced)` };
}

/** First month the member is eligible to retire, searching forward from `from`. */
export function firstEligibleDate(inputs: ServiceInputs, from: YearMonth, horizonMonths = 600): YearMonth | null {
  for (let i = toIndex(from); i <= toIndex(from) + horizonMonths; i++) {
    const d = fromIndex(i);
    if (eligibility(inputs.tier, serviceAt(inputs, d)).eligible) return d;
  }
  return null;
}
