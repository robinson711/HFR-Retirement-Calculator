// Death before retirement. ERS Handbook p.16, Preretirement Death Benefit:
//  - Not yet eligible to retire (Tier 1 under 60 with 1-25 years; Tier 2 under 56 for FLC): the beneficiary
//    receives member contributions, total interest, plus the member's salary for the prior plan year
//    (October 1 - September 30). No monthly pension.
//  - Less than 1 year of service, job-related death: contributions + interest + salary at time of death.
//  - Eligible to retire: a surviving spouse may choose an Option 2 lifetime benefit (Option 3 for a non-spouse)
//    or the lump sum above. Stress (hazardous duty) credit counts toward eligibility for an in-service death.
import { eligibility, serviceAt, type ServiceInputs, type YearMonth } from './service';

export interface DeathScenario {
  date: YearMonth;
  eligible: boolean;
  lumpSum: number;
  /** Option 2 lifetime monthly benefit to the spouse, if eligible. */
  survivorMonthly: number;
  explanation: string;
}

export interface DeathInputs {
  service: ServiceInputs;
  date: YearMonth;
  contributionsWithInterest: number;
  priorFiscalYearSalary: number;
  /** Maximum monthly benefit if the member had retired on this date. */
  maximumMonthlyAtDate: number;
  /** Option 2 factor (from the estimate letter, or the rough model). */
  option2Factor: number;
}

export function deathBeforeRetirement(inputs: DeathInputs): DeathScenario {
  const s = serviceAt(inputs.service, inputs.date);
  // Stress credit counts toward eligibility for an in-service death.
  const forDeath = { ...s, eligibilityMonths: s.eligibilityMonths + s.stressMonths };
  const elig = eligibility(inputs.service.tier, forDeath);
  const lumpSum = inputs.contributionsWithInterest + inputs.priorFiscalYearSalary;
  if (elig.eligible) {
    return {
      date: inputs.date,
      eligible: true,
      lumpSum,
      survivorMonthly: inputs.maximumMonthlyAtDate * inputs.option2Factor,
      explanation: 'Eligible to retire: a spouse who is your only beneficiary may choose an Option 2 lifetime benefit or the lump sum.',
    };
  }
  return {
    date: inputs.date,
    eligible: false,
    lumpSum,
    survivorMonthly: 0,
    explanation: 'Not yet eligible: the beneficiary receives contributions plus interest plus one year of salary, with no pension.',
  };
}

/**
 * Life insurance gap: the present value of the survivor pension the family would have had at eligibility,
 * minus the lump sum actually paid. A rough guide to term life coverage before eligibility.
 */
export function insuranceGap(survivorMonthlyAtEligibility: number, survivorAnnuityFactor: number, lumpSum: number): number {
  return Math.max(0, survivorMonthlyAtEligibility * survivorAnnuityFactor - lumpSum);
}
