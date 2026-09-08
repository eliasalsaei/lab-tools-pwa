import { ohFromPh, conductivityFromOH, totalAmmoniaMgL, LAMBDA_NH4 } from '../lib/high-purity-ph.js';

export default {
  id: 'boiler-conductivity-from-ph',
  domain: 'boiler',
  title: 'Expected Conductivity from Target pH',
  subtitle: 'Reverse check — what specific conductivity a target cycle pH should give',
  description: 'Gives the specific conductivity to expect at a target pH in clean ammoniated high-purity water, plus the ammonia needed to hold it. Use to set control limits and to sanity-check an on-line pH reading.',
  procedureRef: 'boiler-calculated-ph-cycle-chemistry',
  inputs: [
    { id: 'targetPh', label: 'Target pH (at 25 °C)', default: 9.2 },
    { id: 'lambdaCation', label: 'Cation Equivalent Conductivity (73.5 = ammonia)', unit: 'S·cm²/mol', default: LAMBDA_NH4 },
  ],
  compute({ targetPh, lambdaCation }) {
    if (!(targetPh >= 7 && targetPh <= 12)) throw new Error('Target pH must be between 7 and 12');
    if (!(lambdaCation > 0)) throw new Error('Cation equivalent conductivity must be greater than 0');

    const oh = ohFromPh(targetPh);
    const kappa = conductivityFromOH(oh, lambdaCation);

    const result = {
      'Expected Specific Conductivity': { value: kappa, unit: 'µS/cm at 25 °C', decimals: 3 },
    };

    if (lambdaCation === LAMBDA_NH4) {
      result['Ammonia Required'] = { value: totalAmmoniaMgL(oh), unit: 'mg/L as NH3', decimals: 3 };
    }

    return result;
  },
};
