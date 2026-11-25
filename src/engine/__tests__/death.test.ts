import { deathBeforeRetirement } from '../death';
import { accumulatedContributions } from '../pension';

const service = { tier: 'tier2-converted' as const, hire: { year: 2014, month: 5 }, birth: { year: 1985, month: 6 }, stressCredit: true, sickLeaveMonths: 0 };

describe('death before retirement (ERS Handbook p.16)', () => {
  it('pays contributions + interest + one year of salary before eligibility', () => {
    const d = deathBeforeRetirement({ service, date: { year: 2030, month: 1 }, contributionsWithInterest: 80000, priorFiscalYearSalary: 95000, maximumMonthlyAtDate: 3000, option2Factor: 0.9 });
    expect(d.eligible).toBe(false);
    expect(d.lumpSum).toBe(175000);
    expect(d.survivorMonthly).toBe(0);
  });
  it('counts stress credit toward eligibility for an in-service death', () => {
    // At May 2035: 21 years actual + 4y2m stress = 25y2m, eligible for death purposes only.
    const d = deathBeforeRetirement({ service, date: { year: 2035, month: 5 }, contributionsWithInterest: 150000, priorFiscalYearSalary: 120000, maximumMonthlyAtDate: 6000, option2Factor: 0.95 });
    expect(d.eligible).toBe(true);
    expect(d.survivorMonthly).toBeCloseTo(5700, 6);
  });
  it('accumulates contributions with interest', () => {
    const years = [{ earnable: 100000 }, { earnable: 100000 }];
    expect(accumulatedContributions(years, 0.085, 0, 0.04)).toBeCloseTo(8500 * 1.04 + 8500, 6);
  });
});
