// Leave paid out at retirement, and how much of it can go into the 457(b).
// Sources (src/rules/leave-457.json):
//  - Annual leave: paid up to 260 hours, or the fire suppression equivalent (Personnel Manual 10.6).
//  - Holiday leave: paid up to 240 hours, 336 for fire suppression (Manual 8.13).
//  - Compensatory time: non-exempt maximum 240 hours, 336 for fire suppression (Manual 8.12(A)).
//  - Paid at 100% of the regular hourly rate (per user).
//  - 457(b) limits and catch-ups: IRS Notices 2025-67 and 2026-66; special 3-year catch-up: IRS Issue Snapshot.
import { ruleValue } from './rules';
import type { WorkSchedule } from './sickLeave';

export interface LeaveBalances {
  annualHours: number;
  holidayHours: number;
  compHours: number;
}

export interface PayoutLine {
  kind: 'annual' | 'holiday' | 'comp';
  label: string;
  hours: number;
  paidHours: number;
  capHours: number;
  amount: number;
}

export function leavePayout(schedule: WorkSchedule, hourlyRate: number, b: LeaveBalances): { lines: PayoutLine[]; total: number } {
  const key = schedule === 'fireSuppression' ? 'fireSuppression' : 'fortyHour';
  const rate = ruleValue<number>('leave-457:leave.payoutRate');
  const line = (kind: PayoutLine['kind'], label: string, hours: number, capRule: string): PayoutLine => {
    const capHours = ruleValue<number>(`leave-457:${capRule}.${key}`);
    const paidHours = Math.min(Math.max(0, hours), capHours);
    return { kind, label, hours, paidHours, capHours, amount: paidHours * hourlyRate * rate };
  };
  const lines = [
    line('annual', 'Annual leave', b.annualHours, 'annualLeave.payoutCapHours'),
    line('holiday', 'Holiday leave', b.holidayHours, 'holidayLeave.payoutCapHours'),
    line('comp', 'Compensatory time', b.compHours, 'compTime.maxHours'),
  ];
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/** A yearly IRS figure: the published value, or the latest one grown with inflation in $500 steps (an estimate). */
function yearly(rule: string, year: number, inflation: number): { value: number; published: boolean } {
  const table = ruleValue<Record<string, number>>(`leave-457:${rule}`);
  if (table[String(year)] !== undefined) return { value: table[String(year)]!, published: true };
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const last = years[years.length - 1]!;
  if (year < years[0]!) return { value: table[String(years[0])]!, published: false };
  const grown = table[String(last)]! * Math.pow(1 + inflation, year - last);
  return { value: Math.floor(grown / 500) * 500, published: false };
}

export interface DeferralInputs {
  calendarYear: number;
  /** Age the member reaches by December 31 of that year. */
  ageAtYearEnd: number;
  inflation: number;
  /** 457(b) deferrals already made that calendar year from regular pay. */
  alreadyDeferred: number;
  /** The member is in the last 3 years before the plan's normal retirement age and elects the special catch-up. */
  specialCatchUp: boolean;
  /** Unused limit from earlier years (from the plan administrator), for the special catch-up. */
  underusedPriorYears: number;
  /** Prior-year Social Security wages, for the Roth catch-up rule. */
  priorYearWages: number;
}

export interface DeferralRoom {
  limit: number;
  catchUp: number;
  catchUpKind: 'none' | 'age50' | 'age60to63' | 'special';
  /** Total that can be deferred that year, before subtracting what was already deferred. */
  yearMax: number;
  /** What is left for the leave payout. */
  room: number;
  /** Age-based catch-up must be Roth (prior-year wages above the threshold). */
  catchUpMustBeRoth: boolean;
  rothThreshold: number;
  estimatedLimits: boolean;
}

export function deferralRoom(i: DeferralInputs): DeferralRoom {
  const base = yearly('deferral.limit', i.calendarYear, i.inflation);
  const c50 = yearly('deferral.catchUp50', i.calendarYear, i.inflation);
  const c60 = yearly('deferral.catchUp60to63', i.calendarYear, i.inflation);
  const threshold = yearly('deferral.rothCatchUpWageThreshold', i.calendarYear, i.inflation);
  let ageKind: DeferralRoom['catchUpKind'] = 'none';
  let ageCatchUp = 0;
  if (i.ageAtYearEnd >= 60 && i.ageAtYearEnd <= 63) {
    ageKind = 'age60to63';
    ageCatchUp = c60.value;
  } else if (i.ageAtYearEnd >= 50) {
    ageKind = 'age50';
    ageCatchUp = c50.value;
  }
  // The special catch-up and the age-based catch-up can't both be used in one year: the larger applies.
  const multiple = ruleValue<number>('leave-457:deferral.specialCatchUp');
  const special = i.specialCatchUp ? Math.min(multiple * base.value, base.value + Math.max(0, i.underusedPriorYears)) : 0;
  const ageTotal = base.value + ageCatchUp;
  const useSpecial = special > ageTotal;
  const yearMax = useSpecial ? special : ageTotal;
  return {
    limit: base.value,
    catchUp: yearMax - base.value,
    catchUpKind: useSpecial ? 'special' : ageKind,
    yearMax,
    room: Math.max(0, yearMax - Math.max(0, i.alreadyDeferred)),
    catchUpMustBeRoth: !useSpecial && ageCatchUp > 0 && i.priorYearWages > threshold.value,
    rothThreshold: threshold.value,
    estimatedLimits: !(base.published && c50.published && c60.published),
  };
}
