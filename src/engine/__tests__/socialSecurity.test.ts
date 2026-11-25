import { claimingFactor, estimatePia, fullRetirementAgeMonths } from '../socialSecurity';

describe('Social Security estimator', () => {
  it('applies the 2026 PIA formula to the highest 35 years', () => {
    // 35 years at $60,000: AIME = 60,000 x 35 / 420 = 5,000.
    // PIA = 0.9 x 1,286 + 0.32 x (5,000 - 1,286) = 1,157.40 + 1,188.48 = 2,345.88 -> 2,345.80 (rounded down to the dime).
    const e = estimatePia(Array(35).fill(60000));
    expect(e.aime).toBe(5000);
    expect(e.pia).toBeCloseTo(2345.8, 2);
  });
  it('counts missing years as zero and caps earnings at the taxable maximum', () => {
    expect(estimatePia(Array(20).fill(60000)).aime).toBe(Math.floor((20 * 60000) / 420));
    expect(estimatePia(Array(35).fill(500000)).aime).toBe(Math.floor((35 * 184500) / 420));
    // Only the top 35 years count.
    expect(estimatePia([...Array(35).fill(60000), ...Array(5).fill(10000)]).aime).toBe(5000);
  });
  it('uses 15% above the second bend point', () => {
    const e = estimatePia(Array(35).fill(184500));
    const aime = Math.floor(184500 / 12);
    const pia = 0.9 * 1286 + 0.32 * (7749 - 1286) + 0.15 * (aime - 7749);
    expect(e.pia).toBeCloseTo(Math.floor(pia * 10) / 10, 2);
  });
  it('sets full retirement age by birth year', () => {
    expect(fullRetirementAgeMonths(1993)).toBe(67 * 12);
    expect(fullRetirementAgeMonths(1957)).toBe(66 * 12 + 6);
  });
  it('reduces early claims and credits late ones', () => {
    expect(claimingFactor(1993, 67)).toBe(1);
    expect(claimingFactor(1993, 62)).toBeCloseTo(0.7, 6); // 36 x 5/9% + 24 x 5/12% = 30%
    expect(claimingFactor(1993, 65)).toBeCloseTo(1 - 24 * (5 / 900), 6);
    expect(claimingFactor(1993, 70)).toBeCloseTo(1.24, 6);
  });
});
