export default {
  id: 'boiler-sulfite-dose',
  domain: 'boiler',
  title: 'Sulfite Residual Dosing',
  subtitle: 'Oxygen scavenger feed required to hit a target sulfite residual',
  procedureRef: 'boiler-sulfite-sm4500so3',
  inputs: [
    { id: 'targetResidual', label: 'Target Sulfite Residual (as SO3)', unit: 'mg/L' },
    { id: 'flowRateMGD', label: 'Feedwater Flow', unit: 'MGD' },
    { id: 'productPurity', label: 'Product Purity', unit: '%', default: 100 },
  ],
  compute({ targetResidual, flowRateMGD, productPurity }) {
    if (!(productPurity > 0)) throw new Error('Product purity must be greater than 0');
    const lbsPerDayActive = targetResidual * flowRateMGD * 8.34;
    const lbsPerDayProduct = lbsPerDayActive / (productPurity / 100);
    return {
      'Active Chemical Required': { value: lbsPerDayActive, unit: 'lbs/day' },
      'Product Required': { value: lbsPerDayProduct, unit: 'lbs/day' },
    };
  },
};
