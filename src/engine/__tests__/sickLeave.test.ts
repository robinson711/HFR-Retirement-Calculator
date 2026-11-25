import { compareSickLeave, SHIFT_ACCRUAL_HOURS_PER_YEAR, WORK_SCHEDULES } from '../sickLeave';

describe('sick leave cash vs. credit', () => {
  it('accrues about 145.6 shift hours (13 days) a year', () => {
    expect(SHIFT_ACCRUAL_HOURS_PER_YEAR).toBeCloseTo(145.6, 6);
    expect(SHIFT_ACCRUAL_HOURS_PER_YEAR / 11.2).toBeCloseTo(13, 6);
  });
  it('compares 50% cash with converted credit', () => {
    // 2,240 shift hours = 200 days -> 10 months of credit.
    const r = compareSickLeave({ hours: 2240, hoursPerDay: 11.2, hourlyRate: 40, cashPct: 0.5, marginalTaxRate: 0.25, afs: 150000, benefitFactor: 0.020125, lifeAnnuityFactor: 200 });
    expect(r.creditMonths).toBe(10);
    expect(r.cashGross).toBeCloseTo(44800, 6);
    expect(r.cashAfterTax).toBeCloseTo(33600, 6);
    expect(r.pensionIncreaseMonthly).toBeCloseTo((150000 * (10 / 12) * 0.020125) / 12, 6);
    expect(r.better).toBe('credit');
  });
});

describe('work schedule (Personnel Manual 10.7(D))', () => {
  it('accrues 145.6 hours for fire suppression and 104 for a 40-hour employee', () => {
    expect(WORK_SCHEDULES.fireSuppression.accrualHoursPerYear).toBeCloseTo(145.6, 10);
    expect(WORK_SCHEDULES.fireSuppression.hoursPerDay).toBe(11.2);
    expect(WORK_SCHEDULES.fortyHour.accrualHoursPerYear).toBe(104);
    expect(WORK_SCHEDULES.fortyHour.hoursPerDay).toBe(8);
  });
  it('gives the same days for the same time worked on either schedule', () => {
    // One year of accrual is 13 days either way: 145.6 / 11.2 = 104 / 8.
    const fire = WORK_SCHEDULES.fireSuppression;
    const forty = WORK_SCHEDULES.fortyHour;
    expect(fire.accrualHoursPerYear / fire.hoursPerDay).toBeCloseTo(forty.accrualHoursPerYear / forty.hoursPerDay, 10);
  });
});
