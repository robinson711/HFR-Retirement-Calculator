import { comparisons, computeScenario, deathByYear, defaultInputs, plopCumulative, survivorView, computePension, inServiceDeathEligibility, planInputs, plopToDestination, psoSavings, mortgageBalanceAt, yearsToPayOff, PLOP_MORTGAGE, PLOP_PURCHASE, type ScenarioInputs } from '../model';
import { project } from '../cashflow';

describe('scenario model', () => {
  const inputs = defaultInputs();
  it('computes a full scenario', () => {
    const r = computeScenario(inputs, 100);
    expect(r.pension.eligibility.eligible).toBe(true);
    expect(r.pension.service.actualMonths).toBe(300);
    expect(r.pension.retirementDate).toEqual({ year: 2040, month: 1 });
    expect(r.pension.maximum.monthly).toBeGreaterThan(4000);
    expect(r.pension.fitnessFlagYears).toHaveLength(3);
    expect(r.monteCarlo.percentiles.length).toBe(r.projection.rows.length);
  });
  it('retires earlier with sick leave credit', () => {
    const cash = computePension(inputs);
    const credit = computePension({ ...inputs, sickLeave: { ...inputs.sickLeave, choice: 'credit' } });
    expect(credit.sickLeaveMonthsCredited).toBeGreaterThan(0);
    expect(credit.retirementDate.year * 12 + credit.retirementDate.month).toBeLessThan(cash.retirementDate.year * 12 + cash.retirementDate.month);
  });
  it('uses letter figures when entered', () => {
    const p = computePension({ ...inputs, survivor: { ...inputs.survivor, option: 'option2', letter: { maximum: 7664.84, option1: null, option2: 7468.62, option3: null, option4: null } } });
    expect(p.chosen.basis).toBe('letter');
    expect(p.chosen.retireeMonthly / p.maximum.monthly).toBeCloseTo(7468.62 / 7664.84, 6);
  });
  it('shows the pre-eligibility gap and survivor view', () => {
    const p = computePension(inputs);
    const death = deathByYear(inputs, p);
    expect(death[0]!.eligible).toBe(false);
    expect(death[0]!.gap).toBeGreaterThan(0);
    expect(survivorView(inputs, p, death).length).toBeGreaterThan(3);
  });
  it('builds the comparisons and PLOP curve', () => {
    const c = comparisons({ ...inputs, plop: { ...inputs.plop, months: 12 } }, 50);
    expect(c.map((x) => x.title)).toContain('PLOP vs. no PLOP');
    const p = computePension({ ...inputs, plop: { ...inputs.plop, months: 24 } });
    const curve = plopCumulative(p, 0.07, 0.025);
    expect(curve[0]!.difference).toBeCloseTo(p.plop.lumpSum, 6);
  });
});

describe('in-service death eligibility (ERS Handbook p.16)', () => {
  it('counts stress credit, so 20y10m actual plus 4y2m stress reaches 25 years', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    inputs.member = { tier: 'tier2-converted', birth: { year: 1993, month: 8 }, hire: { year: 2014, month: 5 }, stressCredit: true };
    const pension = computePension(inputs);
    const e = inServiceDeathEligibility(inputs, pension)!;
    expect(e.date).toEqual({ year: 2035, month: 3 });
    expect(e.actualMonths).toBe(250);
    expect(e.stressMonths).toBe(50);
    expect(e.viaStressCredit).toBe(true);
    expect(e.survivorMonthly).toBeGreaterThan(0);
  });
  it('waits for 25 actual years without stress credit', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    inputs.member = { tier: 'tier2-converted', birth: { year: 1993, month: 8 }, hire: { year: 2014, month: 5 }, stressCredit: false };
    inputs.retirement = { targetServiceYears: 30, dateOverride: null };
    const e = inServiceDeathEligibility(inputs, computePension(inputs))!;
    expect(e.date).toEqual({ year: 2039, month: 5 });
    expect(e.viaStressCredit).toBe(false);
  });
});

describe('comparisons', () => {
  it('gives each option its own sustainable spending', () => {
    for (const c of comparisons(defaultInputs({ year: 2026, month: 11 }), 20)) {
      const values = c.variants.map((v) => Math.round(v.sustainable));
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('explains the 25 years vs. 24 years + sick leave gap piece by piece, adding up to the whole gap', () => {
    const [first] = comparisons(defaultInputs({ year: 2026, month: 11 }), 20);
    const b = first!.breakdown!;
    const [full, early] = first!.variants;
    const total = b.lines.reduce((a, l) => a + l.amount, 0);
    expect(Math.abs(total - (full!.sustainable - early!.sustainable))).toBeLessThan(50);
    // Every named piece favors working the extra months with sick leave as cash.
    for (const l of b.lines.slice(0, 3)) expect(l.amount).toBeGreaterThan(0);
  });
});

describe("accounts the member doesn't have", () => {
  it('count as zero balance and zero contributions', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    const without = { ...inputs, accounts: inputs.accounts.map((a) => (a.id === 'roth' ? { ...a, notHeld: true } : a)) };
    const roth = planInputs(without, computePension(without)).accounts.find((a) => a.id === 'roth')!;
    expect(roth.balance).toBe(0);
    expect(roth.contribution).toBe(0);
    expect(computeScenario(without, 20).sustainable).toBeLessThan(computeScenario(inputs, 20).sustainable);
  });
});

describe('public safety officer premium exclusion in the projection', () => {
  it('excludes at most $3,000 (shrinking in today’s dollars) while you are alive, and saves federal tax', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    const plan = planInputs(inputs, computePension(inputs));
    const rows = project(plan).rows.filter((r) => r.retired);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.psoExcluded).toBeLessThanOrEqual(3000);
    expect(rows[1]!.psoExcluded).toBeGreaterThan(rows[rows.length - 1]!.psoExcluded);
    const s = psoSavings(plan);
    expect(s.years).toBeGreaterThan(0);
    expect(s.perYear).toBeGreaterThan(0);
    const dead = project({ ...plan, memberDeathYear: plan.retirementYear + 1 }).rows.filter((r) => r.year >= plan.retirementYear + 1);
    for (const r of dead) expect(r.psoExcluded).toBe(0);
  });
});

describe('where the PLOP goes', () => {
  const inputs = { ...defaultInputs({ year: 2026, month: 11 }), plop: { months: 24, destination: '457b', per1000Override: null } };
  it('is a tax-free rollover into the traditional 457(b)', () => {
    const d = plopToDestination(inputs, computePension(inputs));
    expect(d.rollover).toBe(true);
    expect(d.tax).toBe(0);
  });
  it('is taxed as income when paid to the taxable account', () => {
    const i = { ...inputs, plop: { ...inputs.plop, destination: 'taxable' } };
    const p = computePension(i);
    const d = plopToDestination(i, p);
    expect(d.rollover).toBe(false);
    expect(d.tax).toBeGreaterThan(p.plop.lumpSum * 0.1);
    expect(d.net).toBeCloseTo(p.plop.lumpSum - d.tax, 6);
  });
  it('labels the Compare rows with where the money goes', () => {
    const plop = comparisons(inputs, 10).find((c) => c.title === 'PLOP vs. no PLOP')!;
    expect(plop.variants[1]!.label).toMatch(/457\(b\)/);
    expect(plop.variants[1]!.note).toMatch(/Rolled into/);
    expect(plop.variants.some((v) => /all-stock rollover/.test(v.label))).toBe(true);
    expect(plop.variants.some((v) => /pay down the mortgage/.test(v.label))).toBe(true);
  });
});

describe('PLOP to pay down the mortgage or for a large purchase', () => {
  const base = defaultInputs({ year: 2026, month: 11 });
  const withPlop = (destination: string, extra: Partial<ScenarioInputs['plop']> = {}, expenses: Partial<ScenarioInputs['expenses']> = {}): ScenarioInputs => ({
    ...base,
    plop: { ...base.plop, months: 24, destination, ...extra },
    expenses: { ...base.expenses, ...expenses },
  });

  it('estimates the mortgage balance from the payment, payoff year and rate', () => {
    expect(mortgageBalanceAt(2040, 12000, 2044, 0)).toBe(60000);
    expect(mortgageBalanceAt(2040, 12000, 2044, 0.05)).toBeCloseTo((12000 * (1 - 1.05 ** -5)) / 0.05, 6);
    expect(mortgageBalanceAt(2046, 12000, 2045, 0.05)).toBe(0);
    expect(yearsToPayOff(mortgageBalanceAt(2040, 12000, 2049, 0.04), 12000, 0.04)).toBeCloseTo(10, 6);
  });

  it('pays the mortgage off, taxed first, and stops the payment', () => {
    const i = withPlop(PLOP_MORTGAGE, {}, { mortgagePayoffYear: 2042 });
    const p = computePension(i);
    const d = plopToDestination(i, p);
    expect(d.use).toBe('mortgage');
    expect(d.tax).toBeGreaterThan(0);
    expect(d.toMortgage).toBeCloseTo(d.mortgageBalance, 6);
    expect(d.leftover).toBeCloseTo(d.net - d.mortgageBalance, 6);
    expect(d.mortgagePayoffYear).toBe(p.retirementDate.year - 1);
    const plan = planInputs(i, p);
    expect(plan.expenses.mortgagePayoffYear).toBe(p.retirementDate.year - 1);
    expect(project(plan).rows.every((r) => r.mortgage === 0)).toBe(true);
  });

  it('pays part of a bigger mortgage, so it ends sooner with the same payment', () => {
    const i = withPlop(PLOP_MORTGAGE, {}, { mortgageAnnual: 30000, mortgagePayoffYear: 2060 });
    const d = plopToDestination(i, computePension(i));
    expect(d.toMortgage).toBeCloseTo(d.net, 6);
    expect(d.leftover).toBeCloseTo(0, 6);
    expect(d.mortgagePayoffYear).toBeLessThan(2060);
  });

  it('spends a large purchase and saves the rest', () => {
    const all = plopToDestination(withPlop(PLOP_PURCHASE), computePension(withPlop(PLOP_PURCHASE)));
    expect(all.spent).toBeCloseTo(all.net, 6);
    expect(all.leftover).toBe(0);
    const part = withPlop(PLOP_PURCHASE, { purchaseAmount: 40000 });
    const d = plopToDestination(part, computePension(part));
    expect(d.spent).toBe(40000);
    expect(d.leftover).toBeCloseTo(d.net - 40000, 6);
    // Spending it leaves less to live on than investing it.
    const invest = withPlop('457b');
    const s = (x: ScenarioInputs) => computeScenario(x, 10).sustainable;
    expect(s(withPlop(PLOP_PURCHASE))).toBeLessThan(s(invest));
  });

  it('describes the choice on Compare', () => {
    const plop = comparisons(withPlop(PLOP_MORTGAGE), 10).find((c) => c.title === 'PLOP vs. no PLOP')!;
    expect(plop.variants[1]!.label).toMatch(/mortgage/);
    expect(plop.variants[1]!.note).toMatch(/income tax now/);
  });
});
