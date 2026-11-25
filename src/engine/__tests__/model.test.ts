import { comparisons, computeScenario, deathByYear, defaultInputs, plopCumulative, survivorView, computePension } from '../model';

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
