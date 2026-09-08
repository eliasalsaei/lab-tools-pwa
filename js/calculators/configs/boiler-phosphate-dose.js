export default {
  id: 'boiler-phosphate-dose',
  domain: 'boiler',
  title: 'Phosphate Residual Dosing',
  subtitle: 'Chemical feed required to hit a target phosphate residual',
  procedureRef: 'boiler-phosphate-hach-8048',
  inputs: [
    { id: 'targetResidual', label: 'Target Phosphate Residual', unit: 'mg/L' },
    { id: 'flowRate', label: 'Feed/Blowdown Flow', unit: 'm³/day' },
    { id: 'productPurity', label: 'Product Purity (active %)', unit: '%', default: 100 },
  ],
  compute({ targetResidual, flowRate, productPurity }) {
    if (!(productPurity > 0)) throw new Error('Product purity must be greater than 0');
    // 1 mg/L = 1 g/m³
    const kgPerDayActive = (targetResidual * flowRate) / 1000;
    const kgPerDayProduct = kgPerDayActive / (productPurity / 100);
    return {
      'Active Chemical Required': { value: kgPerDayActive, unit: 'kg/day', decimals: 3 },
      'Product Required': { value: kgPerDayProduct, unit: 'kg/day', decimals: 3 },
    };
  },
};
