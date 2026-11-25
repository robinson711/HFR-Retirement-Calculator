// Year-by-year cash flow in today's dollars, plus Monte Carlo and the sustainable-spending solver.
//
// Conventions:
//  - One row per calendar year, from the start year to the year the member reaches the longevity age.
//  - Everything is in today's dollars. Returns, the pension COLA and the mortgage are converted to real terms
//    with the inflation assumption. Tax brackets are assumed to be indexed to inflation.
//  - Before retirement, accounts grow with contributions; spending is assumed to come from pay.
//  - From the retirement year on, income (pension, second job, Social Security) pays spending first, then
//    withdrawals cover the rest plus taxes, in the chosen account order. Extra income goes to the taxable account.
import { normal, mulberry32 } from './random';
import { computeTax, type FilingStatus } from './tax';

/** 457b = traditional (pre-tax) 457(b); roth457 = Roth 457(b), taxed like a Roth. */
export type AccountKind = '457b' | 'roth457' | 'pretax' | 'taxable' | 'roth';
export type AssetClass = 'stocks' | 'bonds' | 'cash';
export type Allocation = Record<AssetClass, number>;

export interface Account {
  id: string;
  label: string;
  kind: AccountKind;
  owner: 'member' | 'spouse';
  balance: number;
  /** Annual contribution in today's dollars until the owner's retirement year. */
  contribution: number;
  allocation: Allocation;
  /** Taxable accounts: cost basis as a share of the balance. */
  basisPct?: number;
  /** The member said they don't have this account: it counts as zero. */
  notHeld?: boolean;
}

/** Accounts as the projection sees them: any the member doesn't have count as zero. */
export function heldAccounts(accounts: Account[]): Account[] {
  return accounts.map((a) => (a.notHeld ? { ...a, balance: 0, contribution: 0 } : a));
}

export interface Assumptions {
  inflation: number;
  returns: Record<AssetClass, { mean: number; volatility: number }>;
  longevityAge: number;
  pensionCola: number;
}

export interface SocialSecurity {
  /** Monthly benefit in today's dollars at the claiming age. */
  monthly: number;
  claimAge: number;
}

export interface SecondJob {
  annual: number;
  endAge: number;
  rsaEmployer: boolean;
  /** Full-time work for an RSA employer suspends the pension (ERS Handbook, Postretirement Employment). */
  fullTime: boolean;
}

export interface PlanInputs {
  startYear: number;
  filing: FilingStatus;
  memberBirthYear: number;
  spouseBirthYear: number | null;
  retirementYear: number;
  /** Months of pension in the retirement year (e.g. retiring April 1 = 9). */
  firstYearPensionMonths: number;
  /** Monthly pension after option and PLOP, in dollars of the retirement year. */
  pensionMonthly: number;
  /** Monthly survivor pension if the member dies (from the chosen option). */
  survivorMonthly: number;
  /** Year the member dies, for survivor views. null = lives to the longevity age. */
  memberDeathYear: number | null;
  /** Lump sums at retirement in today's dollars. */
  plopLumpSum: number;
  plopDestination: string | null;
  sickLeaveCashAfterTax: number;
  /** Annual, holiday and comp leave paid at retirement, after tax, today's dollars. */
  leaveCashAfterTax?: number;
  /** Part of that payout deferred into the traditional 457(b), today's dollars. */
  leaveDeferral?: number;
  secondJob: SecondJob | null;
  socialSecurity: { member: SocialSecurity | null; spouse: SocialSecurity | null };
  expenses: {
    core: number;
    healthPre65: number;
    healthPost65: number;
    /** Nominal annual mortgage payment and payoff year. */
    mortgageAnnual: number;
    mortgagePayoffYear: number;
  };
  accounts: Account[];
  withdrawalOrder: AccountKind[];
  assumptions: Assumptions;
}

export interface YearRow {
  year: number;
  memberAge: number;
  spouseAge: number | null;
  retired: boolean;
  pension: number;
  job: number;
  socialSecurity: number;
  withdrawals: Record<AccountKind, number>;
  taxes: number;
  spending: number;
  core: number;
  healthcare: number;
  mortgage: number;
  balance: number;
  balances: Record<AccountKind, number>;
  shortfall: number;
  pensionSuspended: boolean;
}

export interface Projection {
  rows: YearRow[];
  success: boolean;
  depletedYear: number | null;
  endingBalance: number;
}

const KINDS: AccountKind[] = ['taxable', '457b', 'pretax', 'roth457', 'roth'];
const zeroByKind = (): Record<AccountKind, number> => ({ taxable: 0, '457b': 0, roth457: 0, pretax: 0, roth: 0 });

/** The withdrawal order with every account type in it. A missing roth457 goes just before roth. */
export function completeOrder(order: AccountKind[]): AccountKind[] {
  const out = [...order];
  if (!out.includes('roth457')) {
    const r = out.indexOf('roth');
    out.splice(r === -1 ? out.length : r, 0, 'roth457');
  }
  for (const k of KINDS) if (!out.includes(k)) out.push(k);
  return out;
}

/** Real return for one year from a nominal draw. */
const toReal = (nominal: number, inflation: number) => (1 + nominal) / (1 + inflation) - 1;

export type ReturnDraw = (year: number) => Record<AssetClass, number>;

export const expectedReturns = (a: Assumptions): ReturnDraw => () => ({
  stocks: a.returns.stocks.mean,
  bonds: a.returns.bonds.mean,
  cash: a.returns.cash.mean,
});

export function project(plan: PlanInputs, draw: ReturnDraw = expectedReturns(plan.assumptions), coreOverride?: number): Projection {
  // Older saved scenarios may not list every account type; take any missing ones last, Roths before last.
  const withdrawalOrder = completeOrder(plan.withdrawalOrder);
  const a = plan.assumptions;
  const accounts = plan.accounts.map((acc) => ({ ...acc, basis: (acc.basisPct ?? 1) * acc.balance }));
  const endYear = plan.memberBirthYear + a.longevityAge;
  const rows: YearRow[] = [];
  let depletedYear: number | null = null;
  const core = coreOverride ?? plan.expenses.core;
  const pensionRealFactor = (1 + a.pensionCola) / (1 + a.inflation);

  for (let year = plan.startYear; year <= endYear; year++) {
    const memberAge = year - plan.memberBirthYear;
    const spouseAge = plan.spouseBirthYear === null ? null : year - plan.spouseBirthYear;
    const retired = year >= plan.retirementYear;
    const memberAlive = plan.memberDeathYear === null || year < plan.memberDeathYear;
    const yearsFromNow = year - plan.startYear;

    // Lump sums at retirement.
    if (year === plan.retirementYear) {
      const dest = accounts.find((x) => x.id === plan.plopDestination) ?? accounts.find((x) => x.kind === 'taxable');
      if (dest && plan.plopLumpSum > 0) {
        dest.balance += plan.plopLumpSum;
        if (dest.kind === 'taxable') dest.basis += plan.plopLumpSum;
      }
      const taxable = accounts.find((x) => x.kind === 'taxable');
      if (taxable && plan.sickLeaveCashAfterTax > 0) {
        taxable.balance += plan.sickLeaveCashAfterTax;
        taxable.basis += plan.sickLeaveCashAfterTax;
      }
      const leaveCash = plan.leaveCashAfterTax ?? 0;
      if (taxable && leaveCash > 0) {
        taxable.balance += leaveCash;
        taxable.basis += leaveCash;
      }
      const deferred = plan.leaveDeferral ?? 0;
      const trad457 = accounts.find((x) => x.kind === '457b' && x.owner === 'member') ?? accounts.find((x) => x.kind === '457b');
      if (deferred > 0 && trad457) trad457.balance += deferred;
      else if (deferred > 0 && taxable) {
        taxable.balance += deferred;
        taxable.basis += deferred;
      }
    }

    // Growth for the year.
    const r = draw(year);
    for (const acc of accounts) {
      const nominal = acc.allocation.stocks * r.stocks + acc.allocation.bonds * r.bonds + acc.allocation.cash * r.cash;
      acc.balance *= 1 + toReal(nominal, a.inflation);
      if (!retired && acc.contribution > 0) {
        acc.balance += acc.contribution;
        if (acc.kind === 'taxable') acc.basis += acc.contribution;
      }
    }

    // Income.
    const job = plan.secondJob && retired && memberAlive && memberAge < plan.secondJob.endAge ? plan.secondJob.annual : 0;
    const pensionSuspended = !!(plan.secondJob && job > 0 && plan.secondJob.rsaEmployer && plan.secondJob.fullTime);
    let pension = 0;
    if (retired) {
      const months = year === plan.retirementYear ? plan.firstYearPensionMonths : 12;
      const real = Math.pow(pensionRealFactor, year - plan.retirementYear);
      // Pension is in retirement-year dollars; bring it to today's dollars.
      const toToday = Math.pow(1 + a.inflation, -(plan.retirementYear - plan.startYear));
      const monthly = memberAlive ? plan.pensionMonthly : plan.survivorMonthly;
      pension = pensionSuspended ? 0 : monthly * months * real * toToday;
    }
    let ss = 0;
    const ssm = plan.socialSecurity.member;
    if (ssm && memberAlive && memberAge >= ssm.claimAge) ss += ssm.monthly * 12;
    const sss = plan.socialSecurity.spouse;
    if (sss && spouseAge !== null && spouseAge >= sss.claimAge) ss += sss.monthly * 12;
    // A widowed spouse keeps the larger of the two benefits (simplified).
    if (!memberAlive && ssm && sss && spouseAge !== null && spouseAge >= sss.claimAge) ss = Math.max(ssm.monthly, sss.monthly) * 12;

    // Spending.
    const oldest = Math.max(memberAlive ? memberAge : 0, spouseAge ?? 0);
    const healthcare = retired ? (oldest >= 65 ? plan.expenses.healthPost65 : plan.expenses.healthPre65) : 0;
    const mortgage =
      retired && year <= plan.expenses.mortgagePayoffYear ? plan.expenses.mortgageAnnual / Math.pow(1 + a.inflation, yearsFromNow) : 0;
    const coreSpend = retired ? core : 0;
    const spending = coreSpend + healthcare + mortgage;

    const withdrawals = zeroByKind();
    let taxes = 0;
    let shortfall = 0;
    if (retired) {
      const over65Count = (memberAlive && memberAge >= 65 ? 1 : 0) + (spouseAge !== null && spouseAge >= 65 ? 1 : 0);
      const filing: FilingStatus = plan.filing === 'mfj' && memberAlive ? 'mfj' : plan.filing === 'mfj' ? 'single' : plan.filing;
      // Iterate: withdrawals depend on taxes, taxes on withdrawals.
      let need = spending - (pension + job + ss);
      let tax = 0;
      let take = zeroByKind();
      let gains = 0;
      let penaltyBase = 0;
      for (let iter = 0; iter < 8; iter++) {
        take = zeroByKind();
        gains = 0;
        penaltyBase = 0;
        let remaining = Math.max(0, need + tax);
        for (const kind of withdrawalOrder) {
          for (const acc of accounts.filter((x) => x.kind === kind)) {
            if (remaining <= 0) break;
            const w = Math.min(acc.balance, remaining);
            take[kind] += w;
            remaining -= w;
            if (kind === 'taxable' && acc.balance > 0) gains += w * Math.max(0, 1 - acc.basis / acc.balance);
            const ownerAge = acc.owner === 'member' ? memberAge : (spouseAge ?? memberAge);
            // 457(b) has no 10% penalty after separation; IRA/TSP withdrawals before 59 1/2 do (simplified).
            if (kind === 'pretax' && ownerAge < 60) penaltyBase += w;
          }
        }
        const t = computeTax({
          filing,
          calendarYear: year,
          over65Count,
          pension,
          wages: job,
          pretaxWithdrawals: take['457b'] + take.pretax,
          socialSecurity: ss,
          capitalGains: gains,
          earlyWithdrawalPenaltyBase: penaltyBase,
        });
        if (Math.abs(t.total - tax) < 0.5) {
          tax = t.total;
          break;
        }
        tax = t.total;
      }
      taxes = tax;
      // Apply the final withdrawals.
      const total = Math.max(0, need + tax);
      let remaining = total;
      for (const kind of withdrawalOrder) {
        for (const acc of accounts.filter((x) => x.kind === kind)) {
          if (remaining <= 0) break;
          const w = Math.min(acc.balance, remaining);
          if (acc.kind === 'taxable' && acc.balance > 0) acc.basis -= acc.basis * (w / acc.balance);
          acc.balance -= w;
          withdrawals[kind] += w;
          remaining -= w;
        }
      }
      shortfall = remaining;
      // Surplus income goes to the taxable account.
      if (need + tax < 0) {
        const taxable = accounts.find((x) => x.kind === 'taxable');
        if (taxable) {
          taxable.balance += -(need + tax);
          taxable.basis += -(need + tax);
        }
      }
      need = 0;
      if (shortfall > 0.5 && depletedYear === null) depletedYear = year;
    }

    const balances = zeroByKind();
    for (const acc of accounts) balances[acc.kind] += acc.balance;
    rows.push({
      year,
      memberAge,
      spouseAge,
      retired,
      pension,
      job,
      socialSecurity: ss,
      withdrawals,
      taxes,
      spending,
      core: coreSpend,
      healthcare,
      mortgage,
      balance: KINDS.reduce((s, k) => s + balances[k], 0),
      balances,
      shortfall,
      pensionSuspended,
    });
  }
  const last = rows[rows.length - 1];
  return { rows, success: depletedYear === null, depletedYear, endingBalance: last ? last.balance : 0 };
}

export interface MonteCarloResult {
  paths: number;
  successRate: number;
  /** Balance percentiles by year (today's dollars). */
  percentiles: Array<{ year: number; age: number; p10: number; p50: number; p90: number }>;
}

export function randomReturns(a: Assumptions, rand: () => number): ReturnDraw {
  return () => ({
    stocks: a.returns.stocks.mean + a.returns.stocks.volatility * normal(rand),
    bonds: a.returns.bonds.mean + a.returns.bonds.volatility * normal(rand),
    cash: a.returns.cash.mean + a.returns.cash.volatility * normal(rand),
  });
}

export function monteCarlo(plan: PlanInputs, paths = 1000, seed = 12345, coreOverride?: number): MonteCarloResult {
  const rand = mulberry32(seed);
  const results: Projection[] = [];
  for (let i = 0; i < paths; i++) results.push(project(plan, randomReturns(plan.assumptions, rand), coreOverride));
  const first = results[0]!;
  const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  const percentiles = first.rows.map((row, idx) => {
    const vals = results.map((r) => r.rows[idx]!.balance).sort((x, y) => x - y);
    return { year: row.year, age: row.memberAge, p10: pct(vals, 0.1), p50: pct(vals, 0.5), p90: pct(vals, 0.9) };
  });
  return { paths, successRate: results.filter((r) => r.success).length / paths, percentiles };
}

/** Highest flat core spending (today's dollars) that lasts to the longevity age with expected returns. */
export function sustainableSpending(plan: PlanInputs, draw?: ReturnDraw): number {
  let lo = 0;
  let hi = 1_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (project(plan, draw, mid).success) lo = mid;
    else hi = mid;
  }
  return lo;
}
