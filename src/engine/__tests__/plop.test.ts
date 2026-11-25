import { applyPlop, plopAmountForMonths, plopBreakEvenReturn, plopLimits, plopReductionPer1000 } from '../plop';

describe('PLOP (ERS Handbook pp.27-29)', () => {
  it('matches the handbook example', () => {
    // $3,300 maximum at 60: $4,000 to $79,000; $50,000 costs 50 x $7.80 = $390, leaving $2,910.
    expect(plopLimits(3300)).toEqual({ min: 4000, max: 79000 });
    const r = applyPlop(3300, 50000, 60);
    expect(r.monthlyReduction).toBeCloseTo(390, 6);
    expect(r.reducedMonthly).toBeCloseTo(2910, 6);
  });
  it('caps at 24 months and rounds to $1,000', () => {
    expect(plopAmountForMonths(7664.84, 24)).toBe(183000);
    expect(plopAmountForMonths(7664.84, 12)).toBe(91000);
    expect(plopAmountForMonths(7664.84, 30)).toBe(183000);
    expect(plopAmountForMonths(7664.84, 0)).toBe(0);
  });
  it('reads the reduction table and clamps ages', () => {
    expect(plopReductionPer1000(56)).toBe(7.41);
    expect(plopReductionPer1000(40)).toBe(6.58);
    expect(plopReductionPer1000(80)).toBe(11.24);
  });
  it('solves the break-even return', () => {
    // $100,000 paying $1,000/month for 120 months breaks even near 3.8% a year.
    const r = plopBreakEvenReturn(100000, 1000, 120);
    expect(r).toBeGreaterThan(0.035);
    expect(r).toBeLessThan(0.042);
    expect(plopBreakEvenReturn(120000, 1000, 120)).toBeLessThan(0);
  });
});
