import { ohFromConductivity, phFromOH, totalAmmoniaMgL, LAMBDA_NH4 } from '../lib/high-purity-ph.js';

export default {
  id: 'boiler-ph-from-conductivity',
  domain: 'boiler',
  title: 'pH from Specific Conductivity',
  subtitle: 'Calculated pH for ammoniated high-purity water (feedwater, condensate)',
  description: 'For high-purity cycle water where the alkalising agent is the only significant ionic species. Use the temperature-compensated specific conductivity at 25 °C. Not valid for raw, cooling, or any salt-containing water.',
  procedureRef: 'boiler-calculated-ph-cycle-chemistry',
  inputs: [
    { id: 'conductivity', label: 'Specific Conductivity (at 25 °C)', unit: 'µS/cm' },
    { id: 'cationConductivity', label: 'Cation Conductivity (contamination check)', unit: 'µS/cm', default: 0 },
    { id: 'lambdaCation', label: 'Cation Equivalent Conductivity (73.5 = ammonia)', unit: 'S·cm²/mol', default: LAMBDA_NH4 },
  ],
  compute({ conductivity, cationConductivity, lambdaCation }) {
    if (!(conductivity > 0)) throw new Error('Specific conductivity must be greater than 0');
    if (!(lambdaCation > 0)) throw new Error('Cation equivalent conductivity must be greater than 0');

    const oh = ohFromConductivity(conductivity, lambdaCation);
    const ph = phFromOH(oh);

    const result = {
      'Calculated pH (25 °C)': { value: ph, unit: '', decimals: 2 },
    };

    if (lambdaCation === LAMBDA_NH4) {
      result['Equivalent Ammonia'] = { value: totalAmmoniaMgL(oh), unit: 'mg/L as NH3', decimals: 3 };
    }

    // Cation conductivity approaching specific conductivity means the sample is
    // contaminated and the calculated pH is no longer trustworthy.
    if (Number.isFinite(cationConductivity) && cationConductivity > 0) {
      const ratio = (cationConductivity / conductivity) * 100;
      result['Cation/Specific Ratio'] = { value: ratio, unit: '% (high = contamination)', decimals: 1 };
    }

    return result;
  },
};
