// Survivor options (ERS Handbook p.26):
//  Maximum: highest benefit, stops at the retiree's death.
//  Option 1: slightly less; any unpaid balance of annuity savings goes to the beneficiary as a lump sum.
//  Option 2: reduced benefit; one beneficiary receives the same benefit for life (100%).
//  Option 3: reduced benefit; one beneficiary receives half the benefit for life (50%).
//  Option 4: a custom actuarially equivalent benefit approved by the ERS Board.
//
// RSA does not publish its option factors. The app prefers the exact amounts from the member's RSA estimate
// letter. When none are entered, it uses a ROUGH ESTIMATE from a simple mortality model below. That model is
// not RSA's, and the UI labels every number from it as an estimate.

export type SurvivorOption = 'maximum' | 'option1' | 'option2' | 'option3' | 'option4';

export const OPTION_LABELS: Record<SurvivorOption, string> = {
  maximum: 'Maximum',
  option1: 'Option 1 (refund of remaining savings)',
  option2: 'Option 2 (100% survivor)',
  option3: 'Option 3 (50% survivor)',
  option4: 'Option 4 (custom)',
};

/** Share of the retiree's benefit the beneficiary receives for life. */
export const SURVIVOR_SHARE: Record<SurvivorOption, number> = {
  maximum: 0,
  option1: 0,
  option2: 1,
  option3: 0.5,
  option4: 0,
};

export interface MortalityModel {
  /** Gompertz-Makeham force of mortality: A + B * c^age (per year). */
  A: number;
  B: number;
  c: number;
  /** Annual discount rate used to value the annuities. */
  discountRate: number;
}

/**
 * Shape model. Parameters give a life expectancy of roughly 19 to 20 years at 65, in line with general US
 * population tables, and a 7% discount rate. These are assumptions, not RSA's. The model alone overstates
 * RSA's reductions, so estimates are scaled to one real RSA estimate (CALIBRATION below).
 */
export const DEFAULT_MORTALITY: MortalityModel = { A: 0.0005, B: 0.000022, c: 1.1, discountRate: 0.07 };

/**
 * One RSA estimate letter supplied by a user (June 2026, ERS, converted Tier II): retiree age 45 years 7 months,
 * beneficiary age 46, Maximum $7,664.84, annuity savings $337,208.21; Option 1 $7,625.52, Option 2 $7,468.62,
 * Option 3 $7,565.96. Estimates keep RSA's reduction at these ages and let the model set how the reduction
 * changes with other ages.
 */
export const CALIBRATION = {
  retireeAge: 45 + 7 / 12,
  beneficiaryAge: 46,
  maximumMonthly: 7664.84,
  annuitySavings: 337208.21,
  factors: { option1: 7625.52 / 7664.84, option2: 7468.62 / 7664.84, option3: 7565.96 / 7664.84 },
};

function survival(model: MortalityModel, age: number, months: number): number {
  // Closed-form integral of A + B c^x from age to age + t.
  const t = months / 12;
  const lnc = Math.log(model.c);
  const integral = model.A * t + (model.B / lnc) * (Math.pow(model.c, age + t) - Math.pow(model.c, age));
  return Math.exp(-integral);
}

const MAX_MONTHS = 12 * 70;

/** Expected present value of $1 a month for life (single life), paid monthly in advance. */
export function lifeAnnuity(model: MortalityModel, age: number): number {
  const v = Math.pow(1 + model.discountRate, -1 / 12);
  let sum = 0;
  for (let m = 0; m < MAX_MONTHS; m++) sum += Math.pow(v, m) * survival(model, age, m);
  return sum;
}

/** Joint-life annuity: paid while both are alive. */
export function jointAnnuity(model: MortalityModel, ageX: number, ageY: number): number {
  const v = Math.pow(1 + model.discountRate, -1 / 12);
  let sum = 0;
  for (let m = 0; m < MAX_MONTHS; m++) sum += Math.pow(v, m) * survival(model, ageX, m) * survival(model, ageY, m);
  return sum;
}

/** Life expectancy in years at an age under the model. */
export function lifeExpectancy(model: MortalityModel, age: number): number {
  let sum = 0;
  for (let m = 0; m < MAX_MONTHS; m++) sum += survival(model, age, m);
  return sum / 12;
}

/**
 * Factor applied to the Maximum benefit for a joint-and-survivor option paying `share` to the beneficiary:
 *   factor = a_x / (a_x + share * (a_y - a_xy))
 */
export function jointSurvivorFactor(model: MortalityModel, retireeAge: number, beneficiaryAge: number, share: number): number {
  const ax = lifeAnnuity(model, retireeAge);
  const ay = lifeAnnuity(model, beneficiaryAge);
  const axy = jointAnnuity(model, retireeAge, beneficiaryAge);
  return ax / (ax + share * (ay - axy));
}

/**
 * Option 1 factor: the retiree takes a reduced benefit B; if they die before receiving their annuity savings
 * S, the remainder is refunded. Solve B * a_x + PV(refund) = Max * a_x by fixed-point iteration.
 */
export function option1Factor(model: MortalityModel, retireeAge: number, maximumMonthly: number, annuitySavings: number): number {
  if (annuitySavings <= 0 || maximumMonthly <= 0) return 1;
  const v = Math.pow(1 + model.discountRate, -1 / 12);
  const ax = lifeAnnuity(model, retireeAge);
  let b = maximumMonthly;
  for (let iter = 0; iter < 50; iter++) {
    let refundPV = 0;
    for (let m = 0; m < MAX_MONTHS; m++) {
      const remaining = annuitySavings - b * (m + 1);
      if (remaining <= 0) break;
      const deathProb = survival(model, retireeAge, m) - survival(model, retireeAge, m + 1);
      refundPV += Math.pow(v, m + 1) * deathProb * remaining;
    }
    b = (maximumMonthly * ax - refundPV) / ax;
  }
  return b / maximumMonthly;
}

/**
 * Rough option factors: RSA's reduction from the calibration letter, scaled by how the model's reduction
 * changes between the calibration ages and these ages. Reproduces the calibration letter exactly.
 */
export function estimatedFactors(
  retireeAge: number,
  beneficiaryAge: number,
  maximumMonthly: number,
  annuitySavings: number,
  model: MortalityModel = DEFAULT_MORTALITY,
): Record<'option1' | 'option2' | 'option3', number> {
  const c = CALIBRATION;
  const scale = (modelHere: number, modelCal: number, letter: number) => {
    const reductionCal = 1 - modelCal;
    if (reductionCal <= 0) return letter;
    return Math.max(0, 1 - (1 - letter) * ((1 - modelHere) / reductionCal));
  };
  return {
    option1: scale(
      option1Factor(model, retireeAge, maximumMonthly, annuitySavings),
      option1Factor(model, c.retireeAge, c.maximumMonthly, c.annuitySavings),
      c.factors.option1,
    ),
    option2: scale(
      jointSurvivorFactor(model, retireeAge, beneficiaryAge, 1),
      jointSurvivorFactor(model, c.retireeAge, c.beneficiaryAge, 1),
      c.factors.option2,
    ),
    option3: scale(
      jointSurvivorFactor(model, retireeAge, beneficiaryAge, 0.5),
      jointSurvivorFactor(model, c.retireeAge, c.beneficiaryAge, 0.5),
      c.factors.option3,
    ),
  };
}

export interface OptionAmount {
  option: SurvivorOption;
  retireeMonthly: number;
  survivorMonthly: number;
  /** 'letter' = entered from an RSA estimate letter; 'estimate' = rough model. */
  basis: 'letter' | 'estimate';
}

export interface OptionInputs {
  maximumMonthly: number;
  retireeAge: number;
  beneficiaryAge: number;
  annuitySavings: number;
  /** Factors or amounts from an RSA estimate letter, as a fraction of Maximum (e.g. 0.9744). */
  letterFactors?: Partial<Record<SurvivorOption, number>>;
  model?: MortalityModel;
}

export function optionAmounts(inputs: OptionInputs): OptionAmount[] {
  const model = inputs.model ?? DEFAULT_MORTALITY;
  const est: Record<Exclude<SurvivorOption, 'option4'>, number> = {
    maximum: 1,
    ...estimatedFactors(inputs.retireeAge, inputs.beneficiaryAge, inputs.maximumMonthly, inputs.annuitySavings, model),
  };
  const opts: SurvivorOption[] = ['maximum', 'option1', 'option2', 'option3', 'option4'];
  return opts.flatMap((option) => {
    const letter = inputs.letterFactors?.[option];
    if (option === 'option4' && letter === undefined) return [];
    const factor = option === 'maximum' ? 1 : (letter ?? est[option as Exclude<SurvivorOption, 'option4'>]);
    const retireeMonthly = inputs.maximumMonthly * factor;
    return [
      {
        option,
        retireeMonthly,
        survivorMonthly: retireeMonthly * SURVIVOR_SHARE[option],
        basis: option === 'maximum' || letter !== undefined ? 'letter' : 'estimate',
      } as OptionAmount,
    ];
  });
}
