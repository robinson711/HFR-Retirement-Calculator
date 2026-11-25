// Federal and Alabama income tax, simplified for retirement planning.
// All amounts are in the dollars of the tax year the brackets come from (2026); the cash-flow model works in
// today's dollars and assumes brackets are indexed to inflation, so the 2026 figures are used every year.
//
// Federal (Rev. Proc. 2025-32): brackets, standard deduction, age-65 additional deduction, 0/15/20% capital
// gains stacking, taxable Social Security (IRC 86). Enhanced senior deduction ($6,000, 2025-2028).
// Alabama: 2%/4%/5% brackets; ERS pensions and Social Security exempt; $6,000 retirement income exclusion per
// taxpayer age 65+; federal income tax paid is deductible; capital gains taxed as ordinary income.
import { ruleValue } from './rules';

export type FilingStatus = 'mfj' | 'single';

export interface TaxInput {
  filing: FilingStatus;
  calendarYear: number;
  /** Number of filers age 65 or older (0-2). */
  over65Count: number;
  /** RSA ERS pension: federally taxable, Alabama exempt. */
  pension: number;
  /** Wages and other ordinary income taxable by both. */
  wages: number;
  /** Pre-tax account withdrawals (457(b), TSP, traditional IRA): taxable by both. */
  pretaxWithdrawals: number;
  /** Social Security benefits received (gross). */
  socialSecurity: number;
  /** Long-term capital gains realized (taxable account). */
  capitalGains: number;
  /** 10% additional tax base (early IRA/TSP withdrawals not covered by an exception). */
  earlyWithdrawalPenaltyBase: number;
  /**
   * Retired public safety officer premium exclusion (IRC 402(l)), already capped by the caller at the lesser of
   * $3,000 or premiums. Federal only; it can't exceed the pension and 457(b)/pre-tax income it comes out of.
   */
  psoExclusion?: number;
}

export interface TaxResult {
  federal: number;
  federalOrdinary: number;
  federalCapitalGains: number;
  penalty: number;
  alabama: number;
  total: number;
  taxableSocialSecurity: number;
  federalTaxableIncome: number;
  alabamaTaxableIncome: number;
}

type Brackets = Array<[number, number]>;

export function bracketTax(income: number, brackets: Brackets): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [floor, rate] = brackets[i]!;
    const next = brackets[i + 1]?.[0] ?? Infinity;
    if (income <= floor) break;
    tax += (Math.min(income, next) - floor) * rate;
  }
  return tax;
}

/** IRC 86: up to 85% of Social Security is taxable depending on provisional income. */
export function taxableSocialSecurity(filing: FilingStatus, otherIncome: number, ss: number): number {
  if (ss <= 0) return 0;
  const t = ruleValue<{ base1: Record<FilingStatus, number>; base2: Record<FilingStatus, number> }>('tax:federal.socialSecurityTaxable');
  const b1 = t.base1[filing];
  const b2 = t.base2[filing];
  const provisional = otherIncome + ss / 2;
  if (provisional <= b1) return 0;
  if (provisional <= b2) return Math.min(0.5 * ss, 0.5 * (provisional - b1));
  return Math.min(0.85 * ss, 0.85 * (provisional - b2) + Math.min(0.5 * ss, 0.5 * (b2 - b1)));
}

export function federalDeduction(filing: FilingStatus, over65Count: number, calendarYear: number, magi: number): number {
  const std = ruleValue<Record<FilingStatus, number>>('tax:federal.standardDeduction')[filing];
  const aged = ruleValue<{ married: number; unmarried: number }>('tax:federal.additionalAged');
  const perAged = filing === 'mfj' ? aged.married : aged.unmarried;
  const senior = ruleValue<{ amount: number; phaseOutSingle: number; phaseOutJoint: number; phaseOutRate: number; lastYear: number }>(
    'tax:federal.seniorDeduction',
  );
  let seniorDed = 0;
  if (calendarYear <= senior.lastYear && over65Count > 0) {
    const threshold = filing === 'mfj' ? senior.phaseOutJoint : senior.phaseOutSingle;
    const perPerson = Math.max(0, senior.amount - Math.max(0, magi - threshold) * senior.phaseOutRate);
    seniorDed = perPerson * over65Count;
  }
  return std + perAged * over65Count + seniorDed;
}

export function computeTax(input: TaxInput): TaxResult {
  const { filing } = input;
  // Federal
  const pso = Math.min(Math.max(0, input.psoExclusion ?? 0), input.pension + input.pretaxWithdrawals);
  const otherForSS = input.pension + input.wages + input.pretaxWithdrawals - pso + input.capitalGains;
  const taxableSS = taxableSocialSecurity(filing, otherForSS, input.socialSecurity);
  const ordinaryGross = input.pension + input.wages + input.pretaxWithdrawals - pso + taxableSS;
  const magi = ordinaryGross + input.capitalGains;
  const deduction = federalDeduction(filing, input.over65Count, input.calendarYear, magi);
  const ordinaryTaxable = Math.max(0, ordinaryGross - deduction);
  const leftoverDeduction = Math.max(0, deduction - ordinaryGross);
  const gainsTaxable = Math.max(0, input.capitalGains - leftoverDeduction);
  const brackets = ruleValue<Brackets>(filing === 'mfj' ? 'tax:federal.brackets.mfj' : 'tax:federal.brackets.single');
  const federalOrdinary = bracketTax(ordinaryTaxable, brackets);
  const [zeroTop, fifteenTop] = ruleValue<Record<FilingStatus, [number, number]>>('tax:federal.capitalGains')[filing];
  // Gains stack on top of ordinary income.
  const start = ordinaryTaxable;
  const end = ordinaryTaxable + gainsTaxable;
  const inBand = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
  const federalCapitalGains = inBand(zeroTop, fifteenTop) * 0.15 + inBand(fifteenTop, Infinity) * 0.2;
  const penalty = input.earlyWithdrawalPenaltyBase * 0.1;
  const federal = federalOrdinary + federalCapitalGains + penalty;

  // Alabama: pension and Social Security exempt.
  const exclusion = ruleValue<number>('tax:alabama.retirementExclusion');
  const alRetirement = Math.max(0, input.pretaxWithdrawals - exclusion * input.over65Count);
  const alGross = input.wages + alRetirement + input.capitalGains;
  const alStd = ruleValue<Record<FilingStatus, number>>('tax:alabama.standardDeduction')[filing];
  const alPersonal = ruleValue<Record<FilingStatus, number>>('tax:alabama.personalExemption')[filing];
  const alTaxable = Math.max(0, alGross - federal - alStd - alPersonal);
  const alRates = ruleValue<Record<FilingStatus, Brackets>>('tax:alabama.rates')[filing];
  const alabama = bracketTax(alTaxable, alRates);

  return {
    federal,
    federalOrdinary,
    federalCapitalGains,
    penalty,
    alabama,
    total: federal + alabama,
    taxableSocialSecurity: taxableSS,
    federalTaxableIncome: ordinaryTaxable + gainsTaxable,
    alabamaTaxableIncome: alTaxable,
  };
}

/** Marginal combined rate on an extra dollar of a given kind of income (finite difference). */
export function marginalRate(input: TaxInput, field: 'wages' | 'pretaxWithdrawals' | 'pension' | 'capitalGains', step = 1000): number {
  const base = computeTax(input).total;
  const bumped = computeTax({ ...input, [field]: input[field] + step }).total;
  return (bumped - base) / step;
}
