export default {
  id: 'boiler-sulfite-dose',
  domain: 'boiler',
  title: 'Sulfite Residual Dosing',
  subtitle: 'Oxygen scavenger feed required to hit a target sulfite residual',
  procedureRef: 'boiler-sulfite-sm4500so3',
  inputs: [
    { id: 'targetResidual', label: 'Target Sulfite Residual (as SO3)', unit: 'mg/L' },
    { id: 'flowRate', label: 'Feedwater Flow', unit: 'm³/day' },
    { id: 'productPurity', label: 'Product Purity (active %)', unit: '%', default: 100 },
  ],
  compute({ targetResidual, flowRate, productPurity }) {
    if (!(productPurity > 0)) throw new Error('Product purity must be greater than 0');
    const kgPerDayActive = (targetResidual * flowRate) / 1000;
    const kgPerDayProduct = kgPerDayActive / (productPurity / 100);
    return {
      'Active Chemical Required': { value: kgPerDayActive, unit: 'kg/day', decimals: 3 },
      'Product Required': { value: kgPerDayProduct, unit: 'kg/day', decimals: 3 },
    };
  },
};
