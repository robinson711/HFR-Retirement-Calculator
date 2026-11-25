import { deferralRoom, leavePayout } from '../leavePayout';
import { computeLeave, computePension, defaultInputs, planInputs } from '../model';

describe('leave payout (Personnel Manual 8.12, 8.13, 10.6)', () => {
  it('pays annual, holiday and comp time at 100% up to each cap', () => {
    const p = leavePayout('fireSuppression', 40, { annualHours: 400, holidayHours: 100, compHours: 500 });
    expect(p.lines.map((l) => l.paidHours)).toEqual([364, 100, 336]);
    expect(p.total).toBeCloseTo((364 + 100 + 336) * 40, 6);
  });
  it('uses the 40-hour caps for 40-hour employees', () => {
    const p = leavePayout('fortyHour', 30, { annualHours: 400, holidayHours: 400, compHours: 400 });
    expect(p.lines.map((l) => l.capHours)).toEqual([260, 240, 240]);
  });
});

describe('457(b) room (IRS Notices 2025-67 and 2026-66)', () => {
  const base = { inflation: 0.025, alreadyDeferred: 0, specialCatchUp: false, underusedPriorYears: 0, priorYearWages: 100000 };
  it('uses the published limits and the age 50 catch-up', () => {
    expect(deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 45 }).yearMax).toBe(24500);
    expect(deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 52 }).yearMax).toBe(32500);
    expect(deferralRoom({ ...base, calendarYear: 2027, ageAtYearEnd: 52 }).yearMax).toBe(34000);
    expect(deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 61 })).toMatchObject({ yearMax: 35750, catchUpKind: 'age60to63' });
  });
  it('uses the larger of the special catch-up and the age catch-up, never both', () => {
    const r = deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 52, specialCatchUp: true, underusedPriorYears: 100000 });
    expect(r).toMatchObject({ yearMax: 49000, catchUpKind: 'special' });
    const small = deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 52, specialCatchUp: true, underusedPriorYears: 3000 });
    expect(small).toMatchObject({ yearMax: 32500, catchUpKind: 'age50' });
  });
  it('subtracts what was already deferred and flags the Roth catch-up rule', () => {
    const r = deferralRoom({ ...base, calendarYear: 2026, ageAtYearEnd: 52, alreadyDeferred: 10000, priorYearWages: 160000 });
    expect(r.room).toBe(22500);
    expect(r.catchUpMustBeRoth).toBe(true);
  });
  it('grows later limits with inflation in $500 steps and marks them as estimates', () => {
    const r = deferralRoom({ ...base, calendarYear: 2030, ageAtYearEnd: 40 });
    expect(r.limit % 500).toBe(0);
    expect(r.limit).toBeGreaterThan(25500);
    expect(r.estimatedLimits).toBe(true);
  });
});

describe('leave payout in the scenario', () => {
  it('lowers income tax when part is deferred and sends it to the 457(b)', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    inputs.leave = { ...inputs.leave, defer: true };
    const pension = computePension(inputs);
    const l = computeLeave(inputs, pension);
    expect(l.payout.total).toBeGreaterThan(0);
    expect(l.withDeferral.deferred).toBeGreaterThan(0);
    expect(l.withDeferral.deferred).toBeLessThanOrEqual(l.room.room);
    expect(l.withDeferral.incomeTax).toBeLessThan(l.without.incomeTax);
    expect(l.withDeferral.fica).toBe(l.without.fica);
    const plan = planInputs(inputs, pension);
    expect(plan.leaveDeferral).toBeGreaterThan(0);
  });
});

describe('leave deferral leaves enough cash for the tax', () => {
  it('never shows negative cash', () => {
    const inputs = defaultInputs({ year: 2026, month: 11 });
    inputs.leave = { ...inputs.leave, defer: true, specialCatchUp: true, underusedPriorYears: 100000 };
    const l = computeLeave(inputs, computePension(inputs));
    expect(l.withDeferral.netCash).toBeGreaterThanOrEqual(-0.01);
  });
});
