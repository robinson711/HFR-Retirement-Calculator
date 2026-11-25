import { bracketTax, computeTax, federalDeduction, taxableSocialSecurity, type TaxInput } from '../tax';

const base: TaxInput = {
  filing: 'mfj', calendarYear: 2030, over65Count: 0, pension: 0, wages: 0, pretaxWithdrawals: 0, socialSecurity: 0, capitalGains: 0, earlyWithdrawalPenaltyBase: 0,
};

describe('federal tax (Rev. Proc. 2025-32)', () => {
  it('matches the 2026 joint bracket table', () => {
    const mfj: Array<[number, number]> = [[0, 0.1], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]];
    expect(bracketTax(100800, mfj)).toBeCloseTo(11600, 6);
    expect(bracketTax(211400, mfj)).toBeCloseTo(35932, 6);
    expect(bracketTax(768700, mfj)).toBeCloseTo(206583.5, 6);
  });
  it('taxes a pension after the standard deduction', () => {
    const t = computeTax({ ...base, pension: 92200 });
    // 92,200 - 32,200 = 60,000 taxable -> 2,480 + 12% x 35,200 = 6,704
    expect(t.federal).toBeCloseTo(6704, 2);
    expect(t.alabama).toBe(0); // ERS pension is exempt in Alabama
  });
  it('adds the age-65 and senior deductions, with the senior deduction ending after 2028', () => {
    expect(federalDeduction('mfj', 2, 2027, 100000)).toBe(32200 + 2 * 1650 + 2 * 6000);
    expect(federalDeduction('mfj', 2, 2029, 100000)).toBe(32200 + 2 * 1650);
    expect(federalDeduction('single', 1, 2027, 85000)).toBeCloseTo(16100 + 2050 + 6000 - 600, 6);
  });
  it('stacks capital gains on ordinary income at 0% and 15%', () => {
    // Ordinary taxable 60,000; gains 50,000 -> 38,900 at 0%, 11,100 at 15%.
    const t = computeTax({ ...base, pension: 92200, capitalGains: 50000 });
    expect(t.federalCapitalGains).toBeCloseTo(11100 * 0.15, 2);
  });
  it('taxes up to 85% of Social Security', () => {
    expect(taxableSocialSecurity('mfj', 0, 40000)).toBe(0);
    expect(taxableSocialSecurity('mfj', 200000, 40000)).toBeCloseTo(34000, 6);
  });
  it('charges the 10% penalty only on the penalty base', () => {
    expect(computeTax({ ...base, pretaxWithdrawals: 50000, earlyWithdrawalPenaltyBase: 50000 }).penalty).toBe(5000);
    expect(computeTax({ ...base, pretaxWithdrawals: 50000 }).penalty).toBe(0);
  });
});

describe('Alabama tax', () => {
  it('exempts the pension and Social Security but taxes 457(b) withdrawals', () => {
    const exempt = computeTax({ ...base, pension: 90000, socialSecurity: 30000 });
    expect(exempt.alabama).toBe(0);
    const t = computeTax({ ...base, pretaxWithdrawals: 50000 });
    // AL taxable = 50,000 - federal tax - 5,000 standard - 3,000 personal exemption
    const alTaxable = 50000 - t.federal - 5000 - 3000;
    expect(t.alabamaTaxableIncome).toBeCloseTo(alTaxable, 6);
    expect(t.alabama).toBeCloseTo(20 + 200 + (alTaxable - 6000) * 0.05, 6);
  });
  it('excludes $6,000 of retirement income per taxpayer age 65+', () => {
    const under = computeTax({ ...base, pretaxWithdrawals: 20000 });
    const over = computeTax({ ...base, pretaxWithdrawals: 20000, over65Count: 2 });
    expect(over.alabamaTaxableIncome).toBeLessThan(under.alabamaTaxableIncome);
  });
});
