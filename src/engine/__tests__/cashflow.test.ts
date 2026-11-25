import { completeOrder, monteCarlo, project, sustainableSpending, type PlanInputs } from '../cashflow';

const plan: PlanInputs = {
  startYear: 2027, filing: 'mfj', memberBirthYear: 1985, spouseBirthYear: 1986, retirementYear: 2040, firstYearPensionMonths: 9,
  pensionMonthly: 7000, survivorMonthly: 6800, memberDeathYear: null, plopLumpSum: 0, plopDestination: null, sickLeaveCashAfterTax: 0,
  secondJob: null, socialSecurity: { member: { monthly: 1800, claimAge: 67 }, spouse: { monthly: 1500, claimAge: 67 } },
  expenses: { core: 60000, healthPre65: 15000, healthPost65: 8000, mortgageAnnual: 18000, mortgagePayoffYear: 2045 },
  accounts: [
    { id: 'd', label: '457(b)', kind: '457b', owner: 'member', balance: 150000, contribution: 10000, allocation: { stocks: 0.8, bonds: 0.2, cash: 0 } },
    { id: 't', label: 'Brokerage', kind: 'taxable', owner: 'member', balance: 20000, contribution: 2000, allocation: { stocks: 1, bonds: 0, cash: 0 }, basisPct: 0.7 },
    { id: 'r', label: 'Roth', kind: 'roth', owner: 'spouse', balance: 30000, contribution: 6000, allocation: { stocks: 1, bonds: 0, cash: 0 } },
  ],
  withdrawalOrder: ['taxable', '457b', 'pretax', 'roth'],
  assumptions: { inflation: 0.025, returns: { stocks: { mean: 0.07, volatility: 0.16 }, bonds: { mean: 0.04, volatility: 0.06 }, cash: { mean: 0.03, volatility: 0.01 } }, longevityAge: 95, pensionCola: 0 },
};

describe('cash flow projection', () => {
  it('runs year by year to the longevity age', () => {
    const p = project(plan);
    expect(p.rows[0]!.year).toBe(2027);
    expect(p.rows[p.rows.length - 1]!.memberAge).toBe(95);
    const r2040 = p.rows.find((r) => r.year === 2040)!;
    expect(r2040.retired).toBe(true);
    expect(r2040.pension).toBeGreaterThan(0);
  });
  it('loses pension purchasing power with no COLA', () => {
    const p = project(plan);
    const a = p.rows.find((r) => r.year === 2041)!.pension;
    const b = p.rows.find((r) => r.year === 2061)!.pension;
    expect(b / a).toBeCloseTo(1 / 1.025 ** 20, 6);
  });
  it('suspends the pension for full-time work with an RSA employer', () => {
    const p = project({ ...plan, secondJob: { annual: 50000, endAge: 60, rsaEmployer: true, fullTime: true } });
    const row = p.rows.find((r) => r.year === 2042)!;
    expect(row.pensionSuspended).toBe(true);
    expect(row.pension).toBe(0);
  });
  it('withdraws taxable first by default', () => {
    const p = project(plan);
    const first = p.rows.find((r) => r.retired && r.withdrawals.taxable + r.withdrawals['457b'] > 0)!;
    expect(first.withdrawals.taxable).toBeGreaterThan(0);
  });
  it('solves for sustainable spending that just lasts', () => {
    const s = sustainableSpending(plan);
    expect(project(plan, undefined, s).success).toBe(true);
    expect(project(plan, undefined, s + 1000).success).toBe(false);
  });
  it('runs a repeatable Monte Carlo', () => {
    const a = monteCarlo(plan, 200, 7);
    const b = monteCarlo(plan, 200, 7);
    expect(a.successRate).toBe(b.successRate);
    const mid = a.percentiles[20]!;
    expect(mid.p10).toBeLessThanOrEqual(mid.p50);
    expect(mid.p50).toBeLessThanOrEqual(mid.p90);
  });
});

describe('Roth 457(b)', () => {
  it('fills in a missing roth457 in old withdrawal orders, just before the Roth IRA', () => {
    expect(completeOrder(['taxable', '457b', 'pretax', 'roth'])).toEqual(['taxable', '457b', 'pretax', 'roth457', 'roth']);
  });
  it('taxes traditional 457(b) withdrawals and not Roth 457(b) withdrawals', () => {
    const only = (kind: '457b' | 'roth457'): PlanInputs => ({
      ...plan,
      accounts: [{ id: 'x', label: kind, kind, owner: 'member', balance: 2_000_000, contribution: 0, allocation: { stocks: 0, bonds: 0, cash: 1 } }],
      withdrawalOrder: [kind],
    });
    const year = (p: PlanInputs) => project(p).rows.find((r) => r.year === 2042)!;
    const trad = year(only('457b'));
    const roth = year(only('roth457'));
    expect(trad.withdrawals['457b']).toBeGreaterThan(0);
    expect(roth.withdrawals.roth457).toBeGreaterThan(0);
    expect(roth.taxes).toBeLessThan(trad.taxes);
  });
});
