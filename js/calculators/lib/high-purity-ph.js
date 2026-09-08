// Shared chemistry for high-purity (power cycle) water: relating specific
// conductivity at 25 °C to pH for water alkalised with ammonia or an amine.
//
// Basis: in high-purity water the only significant ions are the alkalising
// cation (NH4+), OH-, and H+. Charge balance gives [cation] = [OH-] - [H+],
// and the measured specific conductivity is the sum of each ion's contribution.
// Note the base's strength (Kb) does not enter this relationship — only the
// charge balance and the ionic conductivities do.

// Limiting equivalent ionic conductivities at 25 °C, S·cm²/mol
export const LAMBDA_OH = 198.0;
export const LAMBDA_H = 349.8;
export const LAMBDA_NH4 = 73.5;

// Ion product of water at 25 °C
export const KW = 1.0e-14;

// Base dissociation constant for ammonia at 25 °C (used only for the
// equivalent ammonia concentration output, not for the pH relationship)
export const KB_AMMONIA = 1.8e-5;

/**
 * Specific conductivity (µS/cm at 25 °C) produced by a given hydroxide
 * concentration, for water alkalised with a cation of conductivity lambdaCation.
 * @param {number} oh hydroxide concentration, mol/L
 * @param {number} lambdaCation cation limiting equivalent conductivity, S·cm²/mol
 */
export function conductivityFromOH(oh, lambdaCation = LAMBDA_NH4) {
  const h = KW / oh;
  const cation = Math.max(oh - h, 0);
  // λ (S·cm²/mol) × C (mol/L) × 1000 → µS/cm
  return (lambdaCation * cation + LAMBDA_OH * oh + LAMBDA_H * h) * 1000;
}

/**
 * Invert the above: find [OH-] that produces the measured conductivity.
 * Solved by bisection — the function is monotonic above pure water.
 * @param {number} kappa specific conductivity, µS/cm at 25 °C
 * @param {number} lambdaCation cation limiting equivalent conductivity
 * @returns {number} hydroxide concentration, mol/L
 */
export function ohFromConductivity(kappa, lambdaCation = LAMBDA_NH4) {
  const pureWater = conductivityFromOH(1e-7, lambdaCation);
  if (kappa < pureWater) {
    throw new Error(`Conductivity is below the theoretical minimum for pure water (${pureWater.toFixed(3)} µS/cm at 25 °C). Check the reading and its temperature compensation.`);
  }

  let lo = 1e-7;      // pure water, pH 7
  let hi = 1e-2;      // pH 12, far above any cycle chemistry range
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi); // geometric bisection — the scale is logarithmic
    if (conductivityFromOH(mid, lambdaCation) < kappa) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** pH at 25 °C from hydroxide concentration. */
export function phFromOH(oh) {
  return 14 + Math.log10(oh);
}

/** Hydroxide concentration from pH at 25 °C. */
export function ohFromPh(ph) {
  return 10 ** (ph - 14);
}

/**
 * Total ammonia (free NH3 + NH4+) required to produce a given [OH-],
 * expressed as mg/L NH3. Only meaningful when ammonia is the alkalising agent.
 */
export function totalAmmoniaMgL(oh) {
  const h = KW / oh;
  const nh4 = Math.max(oh - h, 0);
  const nh3 = (nh4 * oh) / KB_AMMONIA;
  return (nh4 + nh3) * 17.031 * 1000;
}
