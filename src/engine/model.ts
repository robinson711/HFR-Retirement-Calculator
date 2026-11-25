// Scenario model: turns the user's inputs into every result the screens show.
// Pure functions only; the UI calls `computeScenario` and the comparison helpers.
import schedule from '../data/salary-schedule.json';
import {
  heldAccounts,
  project,
  monteCarlo,
  sustainableSpending,
  type Account,
  type AccountKind,
  type Assumptions,
  type PlanInputs,
  type Projection,
  type MonteCarloResult,
} from './cashflow';
import { deathBeforeRetirement } from './death';
import { accumulatedContributions, averageFinalSalary, maximumMonthly, tierRules, type MaximumBenefit } from './pension';
import { applyPlop, plopAmountForMonths, plopBreakEvenReturn, type PlopResult } from './plop';
import { capEarnable, salaryPath, type Promotion, type SalarySchedule, type SalaryYear } from './salary';
import {
  eligibility,
  fiscalYearOf,
  fromIndex,
  monthsBetween,
  serviceAt,
  shiftHoursToDays,
  sickLeaveCreditMonths,
  toIndex,
  type Eligibility,
  type ServiceAt,
  type Tier,
  type YearMonth,
} from './service';
import { compareSickLeave, WORK_SCHEDULES, type SickLeaveComparison, type WorkSchedule } from './sickLeave';
import { DEFAULT_MORTALITY, estimatedFactors, lifeAnnuity, lifeExpectancy, optionAmounts, type OptionAmount, type SurvivorOption } from './survivor';
import { claimingFactor, estimatePia, fullRetirementAgeMonths, type PiaEstimate } from './socialSecurity';
import { deferralRoom, leavePayout, type DeferralRoom } from './leavePayout';
import { computeTax, type FilingStatus } from './tax';

export const SCHEDULE = schedule as SalarySchedule;

export type PresetName = 'conservative' | 'base' | 'optimistic';

export const PRESETS: Record<PresetName, Omit<Assumptions, 'longevityAge' | 'pensionCola'>> = {
  conservative: {
    inflation: 0.03,
    returns: { stocks: { mean: 0.06, volatility: 0.18 }, bonds: { mean: 0.035, volatility: 0.06 }, cash: { mean: 0.025, volatility: 0.01 } },
  },
  base: {
    inflation: 0.025,
    returns: { stocks: { mean: 0.075, volatility: 0.16 }, bonds: { mean: 0.045, volatility: 0.06 }, cash: { mean: 0.03, volatility: 0.01 } },
  },
  optimistic: {
    inflation: 0.022,
    returns: { stocks: { mean: 0.09, volatility: 0.15 }, bonds: { mean: 0.05, volatility: 0.05 }, cash: { mean: 0.035, volatility: 0.01 } },
  },
};

export interface SsPerson {
  include: boolean;
  claimAge: number;
  /** 'statement': the full-retirement-age amount from the SSA statement. 'estimate': a rough estimate from earnings. */
  source: 'statement' | 'estimate';
  /** Monthly benefit at full retirement age from the SSA statement, today's dollars. */
  fraMonthly: number;
  /** Estimate: years already worked in jobs that paid Social Security tax. */
  pastYears: number;
  /** Estimate: average yearly earnings in those years, today's dollars. */
  pastAverage: number;
  /** Spouse estimate only: yearly earnings now, and the age they stop working. The member's future pay comes from the pay path. */
  currentEarnings: number;
  stopAge: number;
}

export interface ScenarioInputs {
  today: YearMonth;
  filing: FilingStatus;
  member: { tier: Tier; birth: YearMonth; hire: YearMonth; stressCredit: boolean };
  pay: {
    grade: string;
    step: number;
    scheduleColaPct: number;
    fitnessIncentive: boolean;
    overtimeAnnual: number;
    overtimePensionable: boolean;
    promotions: Promotion[];
  };
  sickLeave: {
    balanceHours: number;
    /** Fire suppression or 40-hour schedule; sets the accrual rate and the hours in a sick leave day. */
    workSchedule: WorkSchedule;
    usedHoursPerYear: number;
    choice: 'cash' | 'credit';
    cashPct: number;
  };
  retirement: {
    targetServiceYears: number;
    /** Optional fixed date; otherwise the first month the target service is reached. */
    dateOverride: YearMonth | null;
  };
  /** Current RSA account (contributions + interest) from the member's statement; null = estimate. */
  rsaAccountBalance: number | null;
  /** Annual, holiday and compensatory leave paid out at retirement, and how much of it to defer into the 457(b). */
  leave: {
    annualHours: number;
    holidayHours: number;
    compHours: number;
    defer: boolean;
    /** Dollars to defer; 0 = as much as the limit allows. */
    deferAmount: number;
    specialCatchUp: boolean;
    underusedPriorYears: number;
  };
  plop: { months: number; destination: string | null; per1000Override: number | null };
  survivor: {
    option: SurvivorOption;
    hasBeneficiary: boolean;
    beneficiaryBirth: YearMonth;
    /** Monthly amounts from an RSA estimate letter, with the letter's Maximum. */
    letter: { maximum: number | null; option1: number | null; option2: number | null; option3: number | null; option4: number | null };
  };
  accounts: Account[];
  withdrawalOrder: AccountKind[];
  secondJob: { enabled: boolean; annual: number; endAge: number; rsaEmployer: boolean; fullTime: boolean };
  /** Retired public safety officer exclusion of up to $3,000 a year of health or long-term care premiums (IRC 402(l)). */
  psoPremiumExclusion: boolean;
  socialSecurity: {
    /** Whether the City job withholds Social Security (OASDI) tax. */
    cityJobCovered: boolean;
    member: SsPerson;
    spouse: SsPerson;
  };
  expenses: { core: number; healthPre65: number; healthPost65: number; mortgageAnnual: number; mortgagePayoffYear: number };
  preset: PresetName;
  assumptions: Assumptions;
  monteCarloPaths: number;
}

export function defaultInputs(today: YearMonth = { year: 2026, month: 11 }): ScenarioInputs {
  return {
    today,
    filing: 'mfj',
    member: { tier: 'tier2-converted', birth: { year: 1990, month: 1 }, hire: { year: 2015, month: 1 }, stressCredit: true },
    pay: {
      grade: '15P',
      step: 10,
      scheduleColaPct: 0.02,
      fitnessIncentive: true,
      overtimeAnnual: 0,
      overtimePensionable: true,
      promotions: [],
    },
    leave: { annualHours: 300, holidayHours: 200, compHours: 0, defer: false, deferAmount: 0, specialCatchUp: false, underusedPriorYears: 0 },
    sickLeave: {
      balanceHours: 800,
      workSchedule: 'fireSuppression',
      usedHoursPerYear: 0,
      choice: 'cash',
      cashPct: 0.5,
    },
    retirement: { targetServiceYears: 25, dateOverride: null },
    rsaAccountBalance: null,
    plop: { months: 0, destination: '457b', per1000Override: null },
    survivor: {
      option: 'option2',
      hasBeneficiary: true,
      beneficiaryBirth: { year: 1990, month: 1 },
      letter: { maximum: null, option1: null, option2: null, option3: null, option4: null },
    },
    accounts: [
      {
        id: '457b',
        label: '457(b) traditional',
        kind: '457b',
        owner: 'member',
        balance: 50000,
        contribution: 6000,
        allocation: { stocks: 0.8, bonds: 0.2, cash: 0 },
      },
      {
        id: '457b-roth',
        label: '457(b) Roth',
        kind: 'roth457',
        owner: 'member',
        balance: 0,
        contribution: 0,
        allocation: { stocks: 0.8, bonds: 0.2, cash: 0 },
      },
      {
        id: 'spouse',
        label: 'Spouse TSP / IRA',
        kind: 'pretax',
        owner: 'spouse',
        balance: 20000,
        contribution: 3000,
        allocation: { stocks: 0.8, bonds: 0.2, cash: 0 },
      },
      {
        id: 'taxable',
        label: 'Taxable brokerage',
        kind: 'taxable',
        owner: 'member',
        balance: 10000,
        contribution: 1200,
        allocation: { stocks: 0.7, bonds: 0.2, cash: 0.1 },
        basisPct: 0.8,
      },
      { id: 'roth', label: 'Roth IRA', kind: 'roth', owner: 'member', balance: 15000, contribution: 3000, allocation: { stocks: 1, bonds: 0, cash: 0 } },
    ],
    withdrawalOrder: ['taxable', '457b', 'pretax', 'roth457', 'roth'],
    secondJob: { enabled: false, annual: 40000, endAge: 62, rsaEmployer: false, fullTime: true },
    psoPremiumExclusion: true,
    socialSecurity: {
      cityJobCovered: true,
      member: { include: true, claimAge: 67, source: 'estimate', fraMonthly: 0, pastYears: 12, pastAverage: 55000, currentEarnings: 0, stopAge: 62 },
      spouse: { include: true, claimAge: 67, source: 'estimate', fraMonthly: 0, pastYears: 10, pastAverage: 45000, currentEarnings: 50000, stopAge: 62 },
    },
    expenses: { core: 60000, healthPre65: 14000, healthPost65: 7000, mortgageAnnual: 18000, mortgagePayoffYear: 2045 },
    preset: 'base',
    assumptions: { ...PRESETS.base, longevityAge: 95, pensionCola: 0 },
    monteCarloPaths: 1000,
  };
}

export interface PensionResult {
  retirementDate: YearMonth;
  ageAtRetirement: number;
  service: ServiceAt;
  eligibility: Eligibility;
  salary: SalaryYear[];
  afsYears: SalaryYear[];
  maximum: MaximumBenefit;
  options: OptionAmount[];
  chosen: OptionAmount;
  plop: PlopResult;
  /** Monthly pension after the chosen option and PLOP. */
  finalMonthly: number;
  survivorMonthly: number;
  sickLeaveHoursAtRetirement: number;
  sickLeaveMonthsCredited: number;
  sickLeave: SickLeaveComparison;
  annuitySavings: number;
  fitnessFlagYears: number[];
  plopBreakEven: number;
  lifeExpectancyAtRetirement: number;
}

const ageYears = (birth: YearMonth, date: YearMonth) => monthsBetween(birth, date) / 12;

function sickHoursAt(inputs: ScenarioInputs, date: YearMonth): number {
  const years = Math.max(0, monthsBetween(inputs.today, date) / 12);
  return Math.max(
    0,
    inputs.sickLeave.balanceHours + (WORK_SCHEDULES[inputs.sickLeave.workSchedule].accrualHoursPerYear - inputs.sickLeave.usedHoursPerYear) * years,
  );
}

function sickCreditAt(inputs: ScenarioInputs, date: YearMonth): number {
  if (inputs.sickLeave.choice !== 'credit' || inputs.member.tier === 'tier2') return 0;
  return sickLeaveCreditMonths(shiftHoursToDays(sickHoursAt(inputs, date), WORK_SCHEDULES[inputs.sickLeave.workSchedule].hoursPerDay));
}

/** Retirement date: the override, or the first month with the target service that is also eligible. */
export function retirementDate(inputs: ScenarioInputs): YearMonth {
  if (inputs.retirement.dateOverride) return inputs.retirement.dateOverride;
  const start = toIndex(inputs.today) + 1;
  for (let i = start; i < start + 12 * 60; i++) {
    const d = fromIndex(i);
    const sick = sickCreditAt(inputs, d);
    const s = serviceAt({ ...inputs.member, sickLeaveMonths: sick }, d);
    const meetsTarget = s.eligibilityMonths >= inputs.retirement.targetServiceYears * 12;
    if (meetsTarget && eligibility(inputs.member.tier, s).eligible) return d;
  }
  return fromIndex(start + 12 * 40);
}

function salaryThrough(inputs: ScenarioInputs, lastFiscalYear: number): SalaryYear[] {
  const currentFY = fiscalYearOf(inputs.today);
  const cityServiceMonthsAtStart = Math.max(0, monthsBetween(inputs.member.hire, { year: currentFY - 1, month: 10 }));
  const forward = salaryPath(
    SCHEDULE,
    { ...inputs.pay, currentFiscalYear: currentFY, cityServiceMonthsAtStart, longevityPerMonth: 5.25 },
    Math.max(currentFY, lastFiscalYear),
  );
  // Back-fill earlier years (for a retirement within 10 years) by removing the schedule COLA.
  const back: SalaryYear[] = [];
  const first = forward[0]!;
  for (let k = 10; k >= 1; k--) {
    const f = Math.pow(1 + inputs.pay.scheduleColaPct, -k);
    back.push({
      ...first,
      fiscalYear: currentFY - k,
      base: first.base * f,
      incentive: first.incentive * f,
      overtime: first.overtime * f,
      longevity: first.longevity,
      gross: first.gross * f,
      earnable: first.earnable * f,
      promoted: false,
    });
  }
  return [...back, ...forward].filter((y) => y.fiscalYear <= lastFiscalYear);
}

export function computePension(inputs: ScenarioInputs, dateOverride?: YearMonth): PensionResult {
  const date = dateOverride ?? retirementDate(inputs);
  const sickHours = sickHoursAt(inputs, date);
  const sickMonths = sickCreditAt(inputs, date);
  const service = serviceAt({ ...inputs.member, sickLeaveMonths: sickMonths }, date);
  const elig = eligibility(inputs.member.tier, service);
  const rules = tierRules(inputs.member.tier);
  // Complete fiscal years before the retirement month's fiscal year.
  const lastFullFY = fiscalYearOf(date) - 1;
  const salary = salaryThrough(inputs, Math.max(lastFullFY, fiscalYearOf(inputs.today)));
  const capped = capEarnable(
    salary.filter((y) => y.fiscalYear <= lastFullFY),
    rules.earnableCap,
  );
  const last10 = capped.slice(-10);
  const afs = averageFinalSalary(last10, rules.afsYears);
  const afsYears = [...last10].sort((a, b) => b.earnable - a.earnable).slice(0, rules.afsYears);
  const maximum = maximumMonthly(afs, service.creditedMonths, rules, elig.reduction);
  const age = ageYears(inputs.member.birth, date);
  const beneficiaryAge = ageYears(inputs.survivor.beneficiaryBirth, date);

  // Annuity savings: the member's RSA account at retirement.
  const actualYears = service.actualMonths / 12;
  const priorYears = salary.filter((y) => y.fiscalYear < fiscalYearOf(inputs.today));
  const futureYears = capped.filter((y) => y.fiscalYear >= fiscalYearOf(inputs.today));
  const estimatedPrior =
    inputs.rsaAccountBalance ??
    accumulatedContributions(
      Array.from({ length: Math.max(0, Math.round(actualYears - futureYears.length)) }, (_, i) => ({
        earnable: (priorYears[priorYears.length - 1]?.earnable ?? afs) * Math.pow(1 + inputs.pay.scheduleColaPct, -i),
      })).reverse(),
      rules.contributionRate,
    );
  const annuitySavings = accumulatedContributions(futureYears, rules.contributionRate, estimatedPrior);

  // Options: letter figures if entered (as a share of the letter's Maximum), otherwise the calibrated estimate.
  const L = inputs.survivor.letter;
  const letterFactors: Partial<Record<SurvivorOption, number>> = {};
  if (L.maximum && L.maximum > 0) {
    for (const k of ['option1', 'option2', 'option3', 'option4'] as const) {
      const v = L[k];
      if (v && v > 0) letterFactors[k] = v / L.maximum;
    }
  }
  const options = optionAmounts({ maximumMonthly: maximum.monthly, retireeAge: age, beneficiaryAge, annuitySavings, letterFactors });
  const chosen = options.find((o) => o.option === inputs.survivor.option) ?? options[0]!;

  // PLOP is a share of the Maximum; its reduction is taken from the chosen option's benefit.
  const lump = plopAmountForMonths(maximum.monthly, inputs.plop.months);
  const plop = applyPlop(chosen.retireeMonthly, lump, age, inputs.plop.per1000Override ?? undefined);
  const finalMonthly = plop.reducedMonthly;
  const share = chosen.retireeMonthly > 0 ? chosen.survivorMonthly / chosen.retireeMonthly : 0;
  const survivorMonthly = finalMonthly * share;

  const lastBase = capped[capped.length - 1]?.base ?? 0;
  const tax = computeTax({
    filing: inputs.filing,
    calendarYear: date.year,
    over65Count: 0,
    pension: maximum.monthly * 12,
    wages: 0,
    pretaxWithdrawals: 0,
    socialSecurity: 0,
    capitalGains: 0,
    earlyWithdrawalPenaltyBase: 0,
  });
  const bumped = computeTax({
    filing: inputs.filing,
    calendarYear: date.year,
    over65Count: 0,
    pension: maximum.monthly * 12,
    wages: 10000,
    pretaxWithdrawals: 0,
    socialSecurity: 0,
    capitalGains: 0,
    earlyWithdrawalPenaltyBase: 0,
  });
  const marginal = (bumped.total - tax.total) / 10000;
  const sickLeave = compareSickLeave({
    hours: sickHours,
    hoursPerDay: WORK_SCHEDULES[inputs.sickLeave.workSchedule].hoursPerDay,
    hourlyRate: lastBase / WORK_SCHEDULES[inputs.sickLeave.workSchedule].hoursPerYear,
    cashPct: inputs.sickLeave.cashPct,
    marginalTaxRate: marginal,
    afs,
    benefitFactor: rules.benefitFactor,
    lifeAnnuityFactor: lifeAnnuity({ ...DEFAULT_MORTALITY, discountRate: inputs.assumptions.inflation + 0.02 }, age),
  });

  // Fitness incentive: flag the final 3 fiscal years, which drive the average.
  const fitnessFlagYears = capped.slice(-3).map((y) => y.fiscalYear);
  const le = lifeExpectancy(DEFAULT_MORTALITY, age);
  return {
    retirementDate: date,
    ageAtRetirement: age,
    service,
    eligibility: elig,
    salary: capped,
    afsYears,
    maximum,
    options,
    chosen,
    plop,
    finalMonthly,
    survivorMonthly,
    sickLeaveHoursAtRetirement: sickHours,
    sickLeaveMonthsCredited: sickMonths,
    sickLeave,
    annuitySavings,
    fitnessFlagYears,
    plopBreakEven: plopBreakEvenReturn(plop.lumpSum, plop.monthlyReduction, Math.round(le * 12)),
    lifeExpectancyAtRetirement: le,
  };
}

export interface SsDetail {
  /** Monthly benefit at full retirement age, today's dollars. */
  fraMonthly: number;
  /** Multiplier for the claiming age. */
  factor: number;
  /** Monthly benefit at the claiming age, today's dollars. */
  monthly: number;
  fraAgeMonths: number;
  estimate: PiaEstimate | null;
  /** Yearly earnings the estimate used, today's dollars. */
  earnings: number[];
}

/**
 * Social Security for the member and spouse, in today's dollars at each claiming age. From the SSA statement's
 * full-retirement-age amount, or a rough estimate: past covered years at their average, plus the member's City pay
 * (if covered) until retirement and any second job, or the spouse's current earnings until they stop working.
 */
export function resolveSocialSecurity(
  inputs: ScenarioInputs,
  pension: PensionResult,
): {
  benefits: { member: { monthly: number; claimAge: number } | null; spouse: { monthly: number; claimAge: number } | null };
  member: SsDetail | null;
  spouse: SsDetail | null;
} {
  const ss = inputs.socialSecurity;
  const currentFY = fiscalYearOf(inputs.today);
  const detail = (p: SsPerson, birthYear: number, future: number[]): SsDetail | null => {
    if (!p.include) return null;
    const factor = claimingFactor(birthYear, p.claimAge);
    const fraAgeMonths = fullRetirementAgeMonths(birthYear);
    if (p.source === 'statement') return { fraMonthly: p.fraMonthly, factor, monthly: p.fraMonthly * factor, fraAgeMonths, estimate: null, earnings: [] };
    const earnings = [...Array<number>(Math.max(0, Math.round(p.pastYears))).fill(p.pastAverage), ...future];
    const estimate = estimatePia(earnings);
    return { fraMonthly: estimate.pia, factor, monthly: estimate.pia * factor, fraAgeMonths, estimate, earnings };
  };
  // Member: City pay from next fiscal year until retirement, in today's dollars, then any second job.
  const memberFuture: number[] = [];
  if (ss.cityJobCovered) {
    const retFY = fiscalYearOf(pension.retirementDate);
    for (const y of pension.salary) {
      if (y.fiscalYear <= currentFY || y.fiscalYear >= retFY) continue;
      memberFuture.push(y.gross / Math.pow(1 + inputs.pay.scheduleColaPct, y.fiscalYear - currentFY));
    }
  }
  if (inputs.secondJob.enabled) {
    const years = Math.max(0, Math.round(inputs.secondJob.endAge - pension.ageAtRetirement));
    for (let i = 0; i < years; i++) memberFuture.push(inputs.secondJob.annual);
  }
  const spouseAge = monthsBetween(inputs.survivor.beneficiaryBirth, inputs.today) / 12;
  const spouseFuture = Array<number>(Math.max(0, Math.round(ss.spouse.stopAge - spouseAge))).fill(ss.spouse.currentEarnings);
  const member = detail(ss.member, inputs.member.birth.year, memberFuture);
  const spouse = detail(ss.spouse, inputs.survivor.beneficiaryBirth.year, spouseFuture);
  return {
    benefits: {
      member: member && member.monthly > 0 ? { monthly: member.monthly, claimAge: ss.member.claimAge } : null,
      spouse: spouse && spouse.monthly > 0 ? { monthly: spouse.monthly, claimAge: ss.spouse.claimAge } : null,
    },
    member,
    spouse,
  };
}

export function planInputs(inputs: ScenarioInputs, pension: PensionResult, overrides: Partial<PlanInputs> = {}): PlanInputs {
  const startYear = inputs.today.year + 1;
  const d = pension.retirementDate;
  const toToday = Math.pow(1 + inputs.assumptions.inflation, -(d.year - startYear));
  // Sick leave cash, after tax, in today's dollars.
  const sickCash = inputs.sickLeave.choice === 'cash' ? pension.sickLeave.cashAfterTax * toToday : 0;
  const leave = computeLeave(inputs, pension);
  return {
    startYear,
    filing: inputs.filing,
    memberBirthYear: inputs.member.birth.year,
    spouseBirthYear: inputs.filing === 'mfj' ? inputs.survivor.beneficiaryBirth.year : null,
    retirementYear: d.year,
    firstYearPensionMonths: 13 - d.month,
    pensionMonthly: pension.finalMonthly,
    survivorMonthly: pension.survivorMonthly,
    memberDeathYear: null,
    plopLumpSum: pension.plop.lumpSum * toToday,
    plopDestination: inputs.plop.destination,
    sickLeaveCashAfterTax: sickCash,
    leaveCashAfterTax: leave.chosen.netCash * toToday,
    leaveDeferral: leave.chosen.deferred * toToday,
    secondJob: inputs.secondJob.enabled ? { ...inputs.secondJob } : null,
    psoPremiumExclusion: inputs.psoPremiumExclusion,
    socialSecurity: resolveSocialSecurity(inputs, pension).benefits,
    expenses: inputs.expenses,
    accounts: heldAccounts(inputs.accounts),
    withdrawalOrder: inputs.withdrawalOrder,
    assumptions: inputs.assumptions,
    ...overrides,
  };
}

export interface ScenarioResult {
  pension: PensionResult;
  plan: PlanInputs;
  projection: Projection;
  sustainable: number;
  monteCarlo: MonteCarloResult;
}

export interface LeaveScenario {
  deferred: number;
  incomeTax: number;
  fica: number;
  netCash: number;
}

export interface LeaveResult {
  calendarYear: number;
  hourlyRate: number;
  payout: ReturnType<typeof leavePayout>;
  room: DeferralRoom;
  alreadyDeferred: number;
  /** Wages and pension already received in the retirement calendar year, nominal. */
  otherWages: number;
  otherPension: number;
  /** Most that can go into the 457(b) this year while leaving enough cash for the taxes withheld. */
  maxDeferrable: number;
  without: LeaveScenario;
  withDeferral: LeaveScenario;
  chosen: LeaveScenario;
}

/**
 * Leave paid at retirement (nominal dollars of the retirement year), with and without deferring part of it into
 * the traditional 457(b). Income tax is the extra federal and Alabama tax the payout adds on top of that year's
 * other pay and pension. Social Security and Medicare tax (7.65%) applies to the whole payout either way, because
 * 457(b) deferrals are still subject to it.
 */
export function computeLeave(inputs: ScenarioInputs, pension: PensionResult): LeaveResult {
  const d = pension.retirementDate;
  const schedule = WORK_SCHEDULES[inputs.sickLeave.workSchedule];
  const last = pension.salary[pension.salary.length - 1];
  const hourlyRate = (last?.base ?? 0) / schedule.hoursPerYear;
  const payout = leavePayout(inputs.sickLeave.workSchedule, hourlyRate, inputs.leave);
  const monthsWorked = d.month - 1;
  const nominal = Math.pow(1 + inputs.assumptions.inflation, Math.max(0, d.year - inputs.today.year));
  const yearly457 = inputs.accounts
    .filter((a) => a.owner === 'member' && !a.notHeld && (a.kind === '457b' || a.kind === 'roth457'))
    .reduce((s, a) => s + a.contribution, 0);
  const alreadyDeferred = yearly457 * nominal * (monthsWorked / 12);
  const otherWages = (last?.gross ?? 0) * (monthsWorked / 12);
  const otherPension = pension.finalMonthly * (13 - d.month);
  const prior = pension.salary.find((y) => y.fiscalYear === fiscalYearOf(d) - 1) ?? last;
  const room = deferralRoom({
    calendarYear: d.year,
    ageAtYearEnd: d.year - inputs.member.birth.year,
    inflation: inputs.assumptions.inflation,
    alreadyDeferred,
    specialCatchUp: inputs.leave.specialCatchUp,
    underusedPriorYears: inputs.leave.underusedPriorYears,
    priorYearWages: prior?.gross ?? 0,
  });
  const taxOn = (wages: number) =>
    computeTax({
      filing: inputs.filing,
      calendarYear: d.year,
      over65Count: 0,
      pension: otherPension,
      wages,
      pretaxWithdrawals: 0,
      socialSecurity: 0,
      capitalGains: 0,
      earlyWithdrawalPenaltyBase: 0,
    }).total;
  const baseTax = taxOn(otherWages);
  const fica = inputs.socialSecurity.cityJobCovered ? payout.total * 0.0765 : payout.total * 0.0145;
  const scenario = (deferred: number): LeaveScenario => {
    const incomeTax = taxOn(otherWages + payout.total - deferred) - baseTax;
    return { deferred, incomeTax, fica, netCash: payout.total - deferred - incomeTax - fica };
  };
  const without = scenario(0);
  // Income tax on the cash part is withheld from the payout too, so keep enough cash to cover it.
  const fit = (wanted: number) => {
    let r = scenario(Math.max(0, Math.min(room.room, payout.total - fica, wanted)));
    for (let i = 0; i < 20 && r.netCash < -0.005; i++) r = scenario(Math.max(0, r.deferred + r.netCash));
    return { ...r, netCash: Math.max(0, r.netCash) };
  };
  const withDeferral = fit(inputs.leave.deferAmount > 0 ? inputs.leave.deferAmount : Infinity);
  const maxDeferrable = fit(Infinity).deferred;
  return {
    calendarYear: d.year,
    hourlyRate,
    payout,
    room,
    alreadyDeferred,
    otherWages,
    otherPension,
    maxDeferrable,
    without,
    withDeferral,
    chosen: inputs.leave.defer ? withDeferral : without,
  };
}

/** Federal tax the public safety officer premium exclusion saves, today's dollars, over the retirement years it applies. */
export function psoSavings(plan: PlanInputs): { years: number; perYear: number; total: number } {
  const on = project({ ...plan, psoPremiumExclusion: true }).rows;
  const off = project({ ...plan, psoPremiumExclusion: false }).rows;
  let total = 0;
  let years = 0;
  on.forEach((r, i) => {
    if (r.psoExcluded > 0) {
      years++;
      total += off[i]!.taxes - r.taxes;
    }
  });
  return { years, perYear: years ? total / years : 0, total };
}

export function computeScenario(inputs: ScenarioInputs, paths = inputs.monteCarloPaths): ScenarioResult {
  const pension = computePension(inputs);
  const plan = planInputs(inputs, pension);
  return {
    pension,
    plan,
    projection: project(plan),
    sustainable: sustainableSpending(plan),
    monteCarlo: monteCarlo(plan, paths),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Death before eligibility, by year

export interface DeathRow {
  year: number;
  age: number;
  eligible: boolean;
  lumpSum: number;
  survivorMonthly: number;
  /** Value of the survivor pension the family would get by waiting for eligibility, minus the lump sum. */
  gap: number;
}

export interface InServiceDeathEligibility {
  /** First month a death in service would let the spouse take a lifetime Option 2 benefit. */
  date: YearMonth;
  actualMonths: number;
  stressMonths: number;
  /** Rough Option 2 monthly benefit to the spouse for a death in that month, today's dollars. */
  survivorMonthly: number;
  /** True when stress credit is what makes the member eligible before actual service alone would. */
  viaStressCredit: boolean;
}

/**
 * ERS Handbook p.16: hazardous duty (stress) credit counts toward retirement eligibility for an in-service death of
 * a firefighter. With Tier 1 rules, about 20 years 10 months of actual service plus 4 years 2 months of stress credit
 * reaches 25 years, so the spouse could take a lifetime Option 2 benefit from then on.
 */
export function inServiceDeathEligibility(inputs: ScenarioInputs, pension: PensionResult): InServiceDeathEligibility | null {
  const member = { ...inputs.member, sickLeaveMonths: 0 };
  const start = toIndex(inputs.today);
  const end = toIndex(pension.retirementDate);
  for (let i = start; i <= end; i++) {
    const date = fromIndex(i);
    const s = serviceAt(member, date);
    if (!eligibility(inputs.member.tier, { ...s, eligibilityMonths: s.eligibilityMonths + s.stressMonths }).eligible) continue;
    const rules = tierRules(inputs.member.tier);
    const spouseAge = ageYears(inputs.survivor.beneficiaryBirth, pension.retirementDate);
    const option2 = estimatedFactors(pension.ageAtRetirement, spouseAge, pension.maximum.monthly, pension.annuitySavings).option2;
    const maxAtDate = (pension.maximum.afs * (s.creditedMonths / 12) * rules.benefitFactor) / 12;
    return {
      date,
      actualMonths: s.actualMonths,
      stressMonths: s.stressMonths,
      survivorMonthly: maxAtDate * option2,
      viaStressCredit: !eligibility(inputs.member.tier, s).eligible,
    };
  }
  return null;
}

export function deathByYear(inputs: ScenarioInputs, pension: PensionResult): DeathRow[] {
  const rows: DeathRow[] = [];
  const rules = tierRules(inputs.member.tier);
  const spouseAgeAtRet = ageYears(inputs.survivor.beneficiaryBirth, pension.retirementDate);
  const spouseAnnuity = lifeAnnuity({ ...DEFAULT_MORTALITY, discountRate: inputs.assumptions.inflation + 0.02 }, spouseAgeAtRet);
  const option2Factor = estimatedFactors(pension.ageAtRetirement, spouseAgeAtRet, pension.maximum.monthly, pension.annuitySavings).option2;
  const fullSurvivorValue = pension.maximum.monthly * option2Factor * spouseAnnuity;
  // First year a death in service would qualify the spouse for a lifetime benefit (stress credit counts).
  let eligibleYear = pension.retirementDate.year;
  for (let y = inputs.today.year + 1; y <= pension.retirementDate.year; y++) {
    const s = serviceAt({ ...inputs.member, sickLeaveMonths: 0 }, { year: y, month: inputs.today.month });
    if (eligibility(inputs.member.tier, { ...s, eligibilityMonths: s.eligibilityMonths + s.stressMonths }).eligible) {
      eligibleYear = y;
      break;
    }
  }
  for (let year = inputs.today.year + 1; year <= pension.retirementDate.year; year++) {
    const date: YearMonth = { year, month: inputs.today.month };
    if (toIndex(date) > toIndex(pension.retirementDate)) break;
    const priorFY = pension.salary.find((y) => y.fiscalYear === fiscalYearOf(date) - 1);
    const s = serviceAt({ ...inputs.member, sickLeaveMonths: 0 }, date);
    const maxAtDate = (pension.maximum.afs * (s.creditedMonths / 12) * rules.benefitFactor) / 12;
    const yearsIn = pension.salary.filter((y) => y.fiscalYear < fiscalYearOf(date));
    const contributions = accumulatedContributions(yearsIn.slice(-Math.round(s.actualMonths / 12)), rules.contributionRate);
    const d = deathBeforeRetirement({
      service: { ...inputs.member, sickLeaveMonths: 0 },
      date,
      contributionsWithInterest: contributions,
      priorFiscalYearSalary: priorFY?.gross ?? 0,
      maximumMonthlyAtDate: maxAtDate,
      option2Factor,
    });
    rows.push({
      year,
      age: Math.floor(ageYears(inputs.member.birth, date)),
      eligible: d.eligible,
      lumpSum: d.lumpSum,
      survivorMonthly: d.survivorMonthly,
      // The survivor pension would start at eligibility; discount it back to this year at the same real rate.
      gap: d.eligible ? 0 : Math.max(0, fullSurvivorValue / Math.pow(1.02, Math.max(0, eligibleYear - year)) - d.lumpSum),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------
// Survivor view: spouse income if the member dies at different points.

export interface SurvivorRow {
  /** When the firefighter dies, in plain words. */
  scenario: string;
  option: SurvivorOption;
  /** What the spouse receives, in plain words. */
  explain: string;
  pensionMonthly: number;
  lumpSum: number;
  socialSecurityMonthly: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OPTION_EXPLAIN: Record<SurvivorOption, string> = {
  maximum: 'Your pension stops. Your spouse gets nothing more from RSA.',
  option1: 'Your pension stops. Your spouse gets whatever is left of your annuity savings, once.',
  option2: 'Your spouse keeps getting your same monthly pension for life.',
  option3: 'Your spouse gets half of your monthly pension for life.',
  option4: 'Your spouse gets the amount set in your custom option.',
};

export function survivorView(inputs: ScenarioInputs, pension: PensionResult, death: DeathRow[]): SurvivorRow[] {
  const rows: SurvivorRow[] = [];
  const ss = resolveSocialSecurity(inputs, pension).benefits;
  const widowSS = Math.max(ss.member?.monthly ?? 0, ss.spouse?.monthly ?? 0);
  const firstPre = death.find((d) => !d.eligible);
  if (firstPre) {
    rows.push({
      scenario: `You die while still working, before you could retire (e.g. ${firstPre.year})`,
      option: 'maximum',
      explain: 'No pension. Your spouse gets your contributions plus interest and one year of your salary, once.',
      pensionMonthly: 0,
      lumpSum: firstPre.lumpSum,
      socialSecurityMonthly: widowSS,
    });
  }
  const inService = inServiceDeathEligibility(inputs, pension);
  if (inService && toIndex(inService.date) < toIndex(pension.retirementDate)) {
    rows.push({
      scenario: `You die while still working, after ${MONTH_NAMES[inService.date.month - 1]} ${inService.date.year} (stress credit counts)`,
      option: 'option2',
      explain: 'Your spouse can take a lifetime Option 2 pension as if you had retired that day, or the one-time payment instead.',
      pensionMonthly: inService.survivorMonthly,
      lumpSum: 0,
      socialSecurityMonthly: widowSS,
    });
  }
  const ages = [45, 65, 75].filter((a) => a >= Math.floor(pension.ageAtRetirement));
  const plopShare = pension.chosen.retireeMonthly > 0 ? pension.finalMonthly / pension.chosen.retireeMonthly : 1;
  for (const age of ages) {
    for (const o of pension.options) {
      rows.push({
        scenario: `You die at ${age}, after retiring`,
        option: o.option,
        explain: OPTION_EXPLAIN[o.option],
        pensionMonthly: o.survivorMonthly * plopShare,
        lumpSum: o.option === 'option1' ? Math.max(0, pension.annuitySavings - o.retireeMonthly * 12 * (age - pension.ageAtRetirement)) : 0,
        socialSecurityMonthly: widowSS,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------
// Side-by-side comparisons

export interface Variant {
  label: string;
  note?: string;
  monthlyPension: number;
  retirementDate: YearMonth;
  sustainable: number;
  successRate: number;
  medianEnding: number;
  lumpSum: number;
  /** The plan behind this option, kept so differences between options can be explained. */
  plan: PlanInputs;
}

export function variantOf(
  label: string,
  inputs: ScenarioInputs,
  paths: number,
  note?: string,
  planOverrides?: (p: PlanInputs) => Partial<PlanInputs>,
): Variant {
  const pension = computePension(inputs);
  const base = planInputs(inputs, pension);
  const plan = { ...base, ...(planOverrides ? planOverrides(base) : {}) };
  const mc = monteCarlo(plan, paths);
  return {
    label,
    note,
    monthlyPension: pension.finalMonthly,
    retirementDate: pension.retirementDate,
    sustainable: sustainableSpending(plan),
    successRate: mc.successRate,
    medianEnding: mc.percentiles[mc.percentiles.length - 1]?.p50 ?? 0,
    lumpSum: pension.plop.lumpSum,
    plan,
  };
}

export interface BreakdownLine {
  label: string;
  /** Change in sustainable spending, today's dollars a year. */
  amount: number;
}

export interface Comparison {
  title: string;
  variants: Variant[];
  /** Why the first option's sustainable spending differs from the second's, piece by piece. */
  breakdown?: { from: string; to: string; lines: BreakdownLine[] };
}

/**
 * Splits the gap in sustainable spending between two plans into named pieces. Each piece swaps a few plan fields
 * from `from` to `to`; because the pieces interact, each one is the average of swapping it first-to-last and
 * last-to-first. Whatever is left (fields no piece names) is reported as "Everything else" when it isn't tiny.
 */
export function explainDifference(from: PlanInputs, to: PlanInputs, pieces: Array<{ label: string; keys: Array<keyof PlanInputs> }>): BreakdownLine[] {
  const s = (p: PlanInputs) => sustainableSpending(p);
  const pick = (p: PlanInputs, keys: Array<keyof PlanInputs>) => Object.fromEntries(keys.map((k) => [k, p[k]])) as Partial<PlanInputs>;
  const walk = (order: number[]) => {
    const gains = new Array<number>(pieces.length).fill(0);
    let cur = { ...from };
    let before = s(cur);
    for (const i of order) {
      cur = { ...cur, ...pick(to, pieces[i]!.keys) };
      const after = s(cur);
      gains[i] = after - before;
      before = after;
    }
    return gains;
  };
  const idx = pieces.map((_, i) => i);
  const fwd = walk(idx);
  const rev = walk([...idx].reverse());
  const lines = pieces.map((p, i) => ({ label: p.label, amount: (fwd[i]! + rev[i]!) / 2 }));
  const rest = s(to) - s(from) - lines.reduce((a, l) => a + l.amount, 0);
  if (Math.abs(rest) >= 50) lines.push({ label: 'Everything else', amount: rest });
  return lines;
}

const withAlloc = (accounts: Account[], kind: AccountKind, allocation: Account['allocation']) =>
  accounts.map((a) => (a.kind === kind ? { ...a, allocation } : a));

export function comparisons(inputs: ScenarioInputs, paths = 300): Comparison[] {
  const base = computePension(inputs);
  const out: Comparison[] = [];
  const target = inputs.retirement.targetServiceYears;

  const full = variantOf(`${target} years`, { ...inputs, sickLeave: { ...inputs.sickLeave, choice: 'cash' } }, paths, 'Sick leave taken as cash');
  const early = variantOf(
    `${target - 1} years + sick leave`,
    { ...inputs, sickLeave: { ...inputs.sickLeave, choice: 'credit' }, retirement: { ...inputs.retirement, targetServiceYears: target - 1 } },
    paths,
    'Sick leave converted to service credit',
  );
  const monthsLater = (full.retirementDate.year - early.retirementDate.year) * 12 + full.retirementDate.month - early.retirementDate.month;
  out.push({
    title: `Retire at ${target} years vs. one year earlier with sick leave credit`,
    variants: [full, early],
    breakdown: {
      from: early.label,
      to: full.label,
      lines: explainDifference(early.plan, full.plan, [
        {
          label: `Working ${monthsLater} more month${monthsLater === 1 ? '' : 's'}: pay covers that time, you keep saving, and savings fund a shorter retirement`,
          keys: ['retirementYear', 'firstYearPensionMonths', 'socialSecurity', 'secondJob'],
        },
        {
          label: 'Bigger monthly pension (more service, stress credit and a later final average salary)',
          keys: ['pensionMonthly', 'survivorMonthly', 'plopLumpSum'],
        },
        { label: 'Sick leave paid as cash instead of used for service credit', keys: ['sickLeaveCashAfterTax'] },
        { label: 'Other leave payout (at a slightly higher hourly rate)', keys: ['leaveCashAfterTax', 'leaveDeferral'] },
      ]),
    },
  });
  out.push({
    title: 'Sick leave: cash vs. service credit',
    variants: [
      variantOf('Cash (50%)', { ...inputs, sickLeave: { ...inputs.sickLeave, choice: 'cash' } }, paths),
      variantOf(
        'Service credit',
        { ...inputs, sickLeave: { ...inputs.sickLeave, choice: 'credit' }, retirement: { ...inputs.retirement, dateOverride: base.retirementDate } },
        paths,
        'Same retirement date, larger pension',
      ),
    ],
  });
  if (inputs.pay.promotions.length > 0) {
    out.push({
      title: 'With vs. without promotion',
      variants: [variantOf('With promotion', inputs, paths), variantOf('No promotion', { ...inputs, pay: { ...inputs.pay, promotions: [] } }, paths)],
    });
  }
  const plopMonths = inputs.plop.months > 0 ? inputs.plop.months : 24;
  out.push({
    title: 'PLOP vs. no PLOP',
    variants: [
      variantOf('No PLOP', { ...inputs, plop: { ...inputs.plop, months: 0 } }, paths),
      variantOf(`PLOP ${plopMonths} months`, { ...inputs, plop: { ...inputs.plop, months: plopMonths } }, paths, 'Invested per the destination account'),
      variantOf(
        `PLOP ${plopMonths} months, 100% stocks`,
        { ...inputs, plop: { ...inputs.plop, months: plopMonths, destination: 'plop-stocks' } },
        paths,
        'Rolled into a separate all-stock account',
        (p) => ({
          accounts: [
            ...p.accounts,
            {
              id: 'plop-stocks',
              label: 'PLOP rollover (stocks)',
              kind: 'pretax',
              owner: 'member',
              balance: 0,
              contribution: 0,
              allocation: { stocks: 1, bonds: 0, cash: 0 },
            },
          ],
          plopDestination: 'plop-stocks',
        }),
      ),
    ],
  });
  out.push({
    title: 'Survivor options',
    variants: (['maximum', 'option1', 'option2', 'option3'] as SurvivorOption[]).map((o) =>
      variantOf(o === 'maximum' ? 'Maximum' : `Option ${o.slice(-1)}`, { ...inputs, survivor: { ...inputs.survivor, option: o } }, paths),
    ),
  });
  out.push({
    title: 'All-stock vs. balanced 457(b)',
    variants: [
      variantOf(
        'All stocks',
        { ...inputs, accounts: withAlloc(withAlloc(inputs.accounts, '457b', { stocks: 1, bonds: 0, cash: 0 }), 'roth457', { stocks: 1, bonds: 0, cash: 0 }) },
        paths,
      ),
      variantOf(
        'Balanced 60/40',
        {
          ...inputs,
          accounts: withAlloc(withAlloc(inputs.accounts, '457b', { stocks: 0.6, bonds: 0.4, cash: 0 }), 'roth457', { stocks: 0.6, bonds: 0.4, cash: 0 }),
        },
        paths,
      ),
    ],
  });
  return out;
}

/** PLOP cumulative difference by age: a side fund holding the lump sum, paying back the monthly reduction. */
export function plopCumulative(pension: PensionResult, annualReturn: number, inflation: number, toAge = 95): Array<{ age: number; difference: number }> {
  const rows: Array<{ age: number; difference: number }> = [];
  let fund = pension.plop.lumpSum;
  const startAge = Math.floor(pension.ageAtRetirement);
  for (let age = startAge; age <= toAge; age++) {
    rows.push({ age, difference: fund / Math.pow(1 + inflation, age - startAge) });
    fund = fund * (1 + annualReturn) - pension.plop.monthlyReduction * 12;
  }
  return rows;
}

export const monthsLabel = (m: number) => `${Math.floor(m / 12)} years ${m % 12} months`;
