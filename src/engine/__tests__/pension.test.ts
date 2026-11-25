import { averageFinalSalary, maximumMonthly, tierRules, pensionFromSalary } from '../pension';
import type { SalaryYear } from '../salary';

const yr = (earnable: number, base = earnable): SalaryYear => ({
  fiscalYear: 0, grade: '15P', step: 1, base, incentive: 0, overtime: 0, longevity: 0, gross: earnable, earnable, promoted: false,
});

describe('RSA ERS pension formula', () => {
  // Known RSA estimate (a redacted letter supplied by a member, converted Tier II):
  // Total service 29 years 11 months, average final salary $152,769.00, Maximum $7,664.84.
  it('matches the RSA estimate letter to the cent', () => {
    const r = maximumMonthly(152769, 29 * 12 + 11, tierRules('tier2-converted'));
    expect(r.monthly).toBeCloseTo(7664.84, 2);
  });

  it('reproduces the handbook Tier 1 example', () => {
    // ERS Handbook p.24: $35,000 x 27.5 x .020125 / 12 = $1,614.19
    expect(maximumMonthly(35000, 330, tierRules('tier1')).monthly).toBeCloseTo(1614.19, 2);
  });

  it('reproduces the handbook Tier 2 example and caps at 80%', () => {
    // ERS Handbook p.25: $35,000 x 27.5 x .0165 / 12 = $1,323.44
    expect(maximumMonthly(35000, 330, tierRules('tier2')).monthly).toBeCloseTo(1323.44, 2);
    const capped = maximumMonthly(60000, 50 * 12, tierRules('tier2'));
    expect(capped.capped).toBe(true);
    expect(capped.monthly).toBeCloseTo((60000 * 0.8) / 12, 6);
  });

  it('applies the Tier 2 early (30-year) reduction', () => {
    const r = maximumMonthly(60000, 360, tierRules('tier2'), 0.04);
    expect(r.monthly).toBeCloseTo(((60000 * 30 * 0.0165) / 12) * 0.96, 6);
  });

  it('averages the highest 3 (Tier 1) or 5 (Tier 2) of the last 10 years', () => {
    const years = [200, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => yr(v));
    // The 200 is 11 years back, outside the last 10.
    expect(averageFinalSalary(years, 3)).toBeCloseTo(90, 6);
    expect(averageFinalSalary(years, 5)).toBeCloseTo(80, 6);
  });

  it('caps earnable compensation at 120% of base for Tier 1', () => {
    const years = [yr(150000, 100000), yr(150000, 100000), yr(150000, 100000)];
    const r = pensionFromSalary('tier1', years, 300);
    expect(r.afs).toBeCloseTo(120000, 6);
  });
});
