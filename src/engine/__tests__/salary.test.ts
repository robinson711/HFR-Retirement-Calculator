import schedule from '../../data/salary-schedule.json';
import { promotionStep, salaryPath, type PayInputs, type SalarySchedule } from '../salary';

const s = schedule as SalarySchedule;
const inputs: PayInputs = {
  grade: '15P', step: 10, currentFiscalYear: 2027, scheduleColaPct: 0.02,
  fitnessIncentive: true, overtimeAnnual: 0, overtimePensionable: true,
  cityServiceMonthsAtStart: 150, longevityPerMonth: 5.25, promotions: [],
};

describe('salary schedule', () => {
  it('loads every grade with 25 steps', () => {
    expect(s.colaNotInSchedule).toBe(0);
    expect(Object.keys(s.grades)).toEqual(['13P', '14P', '15P', '16P', '17P', '18P', '19P', '20P']);
    for (const row of Object.values(s.grades)) expect(row).toHaveLength(25);
  });
});

describe('promotion rule (Personnel Manual 8.4(A))', () => {
  it('lands on the first step with at least 5% per grade jumped', () => {
    // 15P step 10 = 84,364.80. One grade up needs >= 88,583.04: 16P step 7 = 88,296 (too low), step 8 = 90,064.
    expect(promotionStep(s, '15P', 10, '16P', 0.05)).toBe(8);
    // Two grades up needs >= 92,801.28: 17P step 7 = 92,726.40 (too low), step 8 = 94,577.60.
    expect(promotionStep(s, '15P', 10, '17P', 0.05)).toBe(8);
  });
  it('uses the percentage passed in', () => {
    // 10% per grade: >= 92,801.28 in 16P -> step 10 = 92,788.80 (too low), step 11 = 94,161.60.
    expect(promotionStep(s, '15P', 10, '16P', 0.1)).toBe(11);
  });
  it('never goes below step 1 and caps at the top step', () => {
    expect(promotionStep(s, '13P', 1, '14P', 0)).toBe(1);
    expect(promotionStep(s, '15P', 25, '16P', 0.5)).toBe(25);
  });
});

describe('salary path', () => {
  it('adds one step per year, schedule COLAs and the fitness incentive, using the FY2027 rates as published', () => {
    const path = salaryPath(s, inputs, 2029);
    expect(path.map((y) => y.step)).toEqual([10, 11, 12]);
    expect(path[0]!.base).toBeCloseTo(84364.8, 2);
    expect(path[2]!.base).toBeCloseTo(86923.2 * 1.02 ** 2, 2);
    expect(path[0]!.incentive).toBeCloseTo(path[0]!.base * 0.05, 6);
    expect(path[0]!.longevity).toBeCloseTo(150 * 5.25, 6);
  });
  it('pays no fitness incentive when the box is off', () => {
    const path = salaryPath(s, { ...inputs, fitnessIncentive: false }, 2029);
    expect(path.every((y) => y.incentive === 0)).toBe(true);
  });
  it('applies a promotion in its fiscal year', () => {
    const path = salaryPath(s, { ...inputs, promotions: [{ grade: '16P', fiscalYear: 2028 }] }, 2029);
    expect(path[1]).toMatchObject({ grade: '16P', promoted: true, promotedFrom: { grade: '15P', step: 11 } });
    // In FY2028 the member would be at 15P step 11 (85,654.40); 5% more needs 89,937.12, so 16P step 8 (90,064).
    expect(path[1]!.step).toBe(8);
    expect(path[2]!.step).toBe(9);
  });
  it('chains promotions and keeps stepping up one step a year (8.4(C))', () => {
    const promotions = [
      { grade: '16P', fiscalYear: 2028 },
      { grade: '18P', fiscalYear: 2031 },
    ];
    const path = salaryPath(s, { ...inputs, promotions }, 2032);
    // FY2028: 15P step 11 -> 16P step 8 (above). FY2029-2030: 16P steps 9, 10.
    // FY2031: 16P step 11 (94,161.60) jumping two grades needs at least 10% more, 103,577.76.
    const fy31 = path.find((y) => y.fiscalYear === 2031)!;
    expect(fy31.promotedFrom).toEqual({ grade: '16P', step: 11 });
    expect(fy31.grade).toBe('18P');
    const row = s.grades['18P']!;
    const need = 94161.6 * 1.1;
    const expected = Math.max(1, row.findIndex((p) => p >= need - 0.005) + 1);
    expect(fy31.step).toBe(expected);
    expect(row[fy31.step - 1]!).toBeGreaterThanOrEqual(need - 0.005);
    if (fy31.step > 1) expect(row[fy31.step - 2]!).toBeLessThan(need);
    expect(path.find((y) => y.fiscalYear === 2032)!.step).toBe(expected + 1);
  });
  it('ignores a promotion that is not to a higher grade', () => {
    const path = salaryPath(s, { ...inputs, promotions: [{ grade: '14P', fiscalYear: 2028 }] }, 2028);
    expect(path[1]).toMatchObject({ grade: '15P', promoted: false });
  });
});
