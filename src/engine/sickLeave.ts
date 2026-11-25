// Sick leave at retirement: cash OR service credit, not both.
//  - Cash: 50% of all sick leave credits at an eligible retirement (Personnel Manual 10.7(H)).
//  - Credit: convert unused sick leave to service credit instead of payment (Manual 10.7(H); ERS Handbook p.21,
//    Tier 1 only, chart p.22). The city sets the maximum days.
//  - Accrual: 4 hours per pay period for a 40-hour week, prorated for longer schedules (Manual 10.7(D)), no cap.
//  - Shift hours: 11.2 fire suppression hours count as one 8-hour day (per user).
import { shiftHoursToDays, sickLeaveCreditMonths } from './service';

/** Fire suppression sick leave accrual per year in shift hours: 4 h x 26 pay periods x (2,912 / 2,080). */
export const SHIFT_ACCRUAL_HOURS_PER_YEAR = 4 * 26 * (2912 / 2080);

export function projectSickLeaveHours(currentHours: number, accrualHoursPerYear: number, usedHoursPerYear: number, years: number): number {
  return Math.max(0, currentHours + (accrualHoursPerYear - usedHoursPerYear) * years);
}

export interface SickLeaveComparison {
  hours: number;
  days: number;
  creditMonths: number;
  cashGross: number;
  cashAfterTax: number;
  /** Extra monthly pension from the added credit. */
  pensionIncreaseMonthly: number;
  /** Present value of that increase over the retiree's life (annuity factor x monthly). */
  pensionIncreaseValue: number;
  /** Months of the larger pension needed to equal the after-tax cash. */
  breakEvenMonths: number;
  better: 'cash' | 'credit';
}

export interface SickLeaveInputs {
  hours: number;
  hoursPerDay: number;
  /** Hourly pay used for the cash-out (fire suppression: annual base / 2,912). */
  hourlyRate: number;
  cashPct: number;
  /** Combined marginal tax rate on the cash (federal + state + FICA where it applies). */
  marginalTaxRate: number;
  /** Average final salary and benefit factor, to price the added credit. */
  afs: number;
  benefitFactor: number;
  capMonths?: number;
  /** Expected present value of $1 a month for life (from survivor.lifeAnnuity). */
  lifeAnnuityFactor: number;
}

export function compareSickLeave(i: SickLeaveInputs): SickLeaveComparison {
  const days = shiftHoursToDays(i.hours, i.hoursPerDay);
  const creditMonths = sickLeaveCreditMonths(days, i.capMonths);
  const cashGross = i.hours * i.hourlyRate * i.cashPct;
  const cashAfterTax = cashGross * (1 - i.marginalTaxRate);
  const pensionIncreaseMonthly = (i.afs * (creditMonths / 12) * i.benefitFactor) / 12;
  const pensionIncreaseValue = pensionIncreaseMonthly * i.lifeAnnuityFactor;
  return {
    hours: i.hours,
    days,
    creditMonths,
    cashGross,
    cashAfterTax,
    pensionIncreaseMonthly,
    pensionIncreaseValue,
    breakEvenMonths: pensionIncreaseMonthly > 0 ? cashAfterTax / pensionIncreaseMonthly : Infinity,
    better: pensionIncreaseValue >= cashAfterTax ? 'credit' : 'cash',
  };
}
