export default {
  id: 'boiler-phosphate-dose',
  domain: 'boiler',
  title: 'Phosphate Residual Dosing',
  subtitle: 'Chemical feed required to hit a target phosphate residual',
  procedureRef: 'boiler-phosphate-sm4500p',
  inputs: [
    { id: 'targetResidual', label: 'Target Phosphate Residual', unit: 'mg/L' },
    { id: 'flowRateMGD', label: 'Feed/Blowdown Flow', unit: 'MGD' },
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
