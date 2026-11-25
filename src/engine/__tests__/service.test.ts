import { eligibility, serviceAt, sickLeaveCreditMonths, sickLeaveDaysForMonths, stressCreditMonths, shiftHoursToDays, firstEligibleDate } from '../service';

describe('sick leave conversion chart (ERS Handbook p.22)', () => {
  it.each([
    [0, 0], [10, 0], [11, 1], [30, 1], [31, 2], [50, 2], [51, 3], [370, 18], [371, 19], [730, 36], [900, 36],
  ])('%i days -> %i months', (days, months) => {
    expect(sickLeaveCreditMonths(days)).toBe(months);
  });
  it('respects the employer cap', () => {
    expect(sickLeaveCreditMonths(730, 12)).toBe(12);
  });
  it('gives the bottom of each chart row', () => {
    expect(sickLeaveDaysForMonths(1)).toBe(11);
    expect(sickLeaveDaysForMonths(36)).toBe(711);
  });
  it('converts 11.2 shift hours to one day', () => {
    expect(shiftHoursToDays(1120)).toBeCloseTo(100, 6);
  });
});

describe('stress bill credit', () => {
  it('is one year per five, prorated to the nearest month', () => {
    expect(stressCreditMonths(300)).toBe(60);
    expect(stressCreditMonths(299)).toBe(60); // 24y11m actual -> 29y11m total, as on the estimate letter
    expect(stressCreditMonths(62)).toBe(12);
  });

  it('excludes sick leave and does not count for eligibility', () => {
    const inputs = { tier: 'tier2-converted' as const, hire: { year: 2014, month: 5 }, birth: { year: 1985, month: 6 }, stressCredit: true, sickLeaveMonths: 12 };
    const s = serviceAt(inputs, { year: 2039, month: 4 });
    expect(s.actualMonths).toBe(299);
    expect(s.stressMonths).toBe(60);
    expect(s.creditedMonths).toBe(299 + 12 + 60);
    expect(s.eligibilityMonths).toBe(299 + 12);
  });

  it('is not available to Tier 2', () => {
    const s = serviceAt({ tier: 'tier2', hire: { year: 2014, month: 5 }, birth: { year: 1985, month: 6 }, stressCredit: true, sickLeaveMonths: 12 }, { year: 2039, month: 5 });
    expect(s.stressMonths).toBe(0);
    expect(s.sickLeaveMonths).toBe(0);
  });
});

describe('eligibility (ERS Handbook p.18)', () => {
  const base = { hire: { year: 2014, month: 5 }, birth: { year: 1985, month: 6 }, stressCredit: true, sickLeaveMonths: 0 };
  it('Tier 1 rules: 25 years at any age', () => {
    expect(firstEligibleDate({ ...base, tier: 'tier2-converted' }, { year: 2026, month: 11 })).toEqual({ year: 2039, month: 5 });
  });
  it('sick leave credit moves eligibility earlier', () => {
    expect(firstEligibleDate({ ...base, tier: 'tier2-converted', sickLeaveMonths: 12 }, { year: 2026, month: 11 })).toEqual({ year: 2038, month: 5 });
  });
  it('Tier 2 firefighters: age 56 with 10 years', () => {
    expect(firstEligibleDate({ ...base, tier: 'tier2' }, { year: 2026, month: 11 })).toEqual({ year: 2041, month: 6 });
  });
  it('Tier 2: 30 years with 2% per year under 56', () => {
    const e = eligibility('tier2', { actualMonths: 360, sickLeaveMonths: 0, stressMonths: 0, eligibilityMonths: 360, creditedMonths: 360, ageMonths: 52 * 12 });
    expect(e.eligible).toBe(true);
    expect(e.reduction).toBeCloseTo(0.08, 6);
  });
});
