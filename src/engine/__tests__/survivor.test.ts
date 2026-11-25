import { CALIBRATION, estimatedFactors, lifeExpectancy, optionAmounts, DEFAULT_MORTALITY } from '../survivor';

describe('survivor options', () => {
  it('reproduces the calibration RSA estimate letter exactly', () => {
    const rows = optionAmounts({
      maximumMonthly: CALIBRATION.maximumMonthly,
      retireeAge: CALIBRATION.retireeAge,
      beneficiaryAge: CALIBRATION.beneficiaryAge,
      annuitySavings: CALIBRATION.annuitySavings,
    });
    const by = Object.fromEntries(rows.map((r) => [r.option, r]));
    expect(by.maximum!.retireeMonthly).toBeCloseTo(7664.84, 2);
    expect(by.option1!.retireeMonthly).toBeCloseTo(7625.52, 2);
    expect(by.option2!.retireeMonthly).toBeCloseTo(7468.62, 2);
    expect(by.option2!.survivorMonthly).toBeCloseTo(7468.62, 2);
    expect(by.option3!.retireeMonthly).toBeCloseTo(7565.96, 2);
    expect(by.option3!.survivorMonthly).toBeCloseTo(3782.98, 1);
    expect(by.option2!.basis).toBe('estimate');
  });

  it('reduces more when the beneficiary is younger and less when older', () => {
    const young = estimatedFactors(56, 40, 6000, 300000);
    const same = estimatedFactors(56, 56, 6000, 300000);
    const old = estimatedFactors(56, 70, 6000, 300000);
    expect(young.option2).toBeLessThan(same.option2);
    expect(same.option2).toBeLessThan(old.option2);
    expect(same.option3).toBeGreaterThan(same.option2);
  });

  it('uses letter figures when entered', () => {
    const rows = optionAmounts({ maximumMonthly: 5000, retireeAge: 50, beneficiaryAge: 50, annuitySavings: 200000, letterFactors: { option2: 0.9, option4: 0.95 } });
    const by = Object.fromEntries(rows.map((r) => [r.option, r]));
    expect(by.option2).toMatchObject({ retireeMonthly: 4500, basis: 'letter' });
    expect(by.option4).toMatchObject({ retireeMonthly: 4750, basis: 'letter' });
  });

  it('has a plausible life expectancy', () => {
    const le = lifeExpectancy(DEFAULT_MORTALITY, 65);
    expect(le).toBeGreaterThan(18);
    expect(le).toBeLessThan(22);
  });
});
