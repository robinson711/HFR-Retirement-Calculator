import schedule from '../../data/salary-schedule.json';
import { promotionStep, salaryPath, type PayInputs, type SalarySchedule } from '../salary';

const s = schedule as SalarySchedule;
const inputs: PayInputs = {
  grade: '15P', step: 10, currentFiscalYear: 2027, missingColaPct: 0.02, scheduleColaPct: 0.02,
  fitnessIncentivePct: 0.05, fitnessStopsFiscalYear: null, overtimeAnnual: 0, overtimePensionable: true,
  cityServiceMonthsAtStart: 150, longevityPerMonth: 5.25, promotions: [], promotionRaisePerGrade: 0.05,
};

describe('salary schedule', () => {
  it('loads every grade with 25 steps', () => {
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
  it('uses the editable percentage', () => {
    // 10% per grade: >= 92,801.28 in 16P -> step 10 = 92,788.80 (too low), step 11 = 94,161.60.
    expect(promotionStep(s, '15P', 10, '16P', 0.1)).toBe(11);
  });
  it('never goes below step 1 and caps at the top step', () => {
    expect(promotionStep(s, '13P', 1, '14P', 0)).toBe(1);
    expect(promotionStep(s, '15P', 25, '16P', 0.5)).toBe(25);
  });
});

describe('salary path', () => {
  it('adds one step per year, the missing COLA, schedule COLAs and the fitness incentive', () => {
    const path = salaryPath(s, inputs, 2029);
    expect(path.map((y) => y.step)).toEqual([10, 11, 12]);
    expect(path[0]!.base).toBeCloseTo(84364.8 * 1.02, 2);
    expect(path[2]!.base).toBeCloseTo(86923.2 * 1.02 * 1.02 ** 2, 2);
    expect(path[0]!.incentive).toBeCloseTo(path[0]!.base * 0.05, 6);
    expect(path[0]!.longevity).toBeCloseTo(150 * 5.25, 6);
  });
  it('drops the fitness incentive once the member stops passing', () => {
    const path = salaryPath(s, { ...inputs, fitnessStopsFiscalYear: 2028 }, 2029);
    expect(path.map((y) => y.incentive > 0)).toEqual([true, false, false]);
  });
  it('applies a promotion in its fiscal year', () => {
    const path = salaryPath(s, { ...inputs, promotions: [{ grade: '16P', fiscalYear: 2028 }] }, 2029);
    expect(path[1]).toMatchObject({ grade: '16P', promoted: true });
    // In FY2028 the member would be at 15P step 11 (85,654.40); 5% more needs 89,937.12, so 16P step 8 (90,064).
    expect(path[1]!.step).toBe(8);
    expect(path[2]!.step).toBe(9);
  });
});
