export default {
  id: 'boiler-coc',
  domain: 'boiler',
  title: 'Cycles of Concentration',
  subtitle: 'Using conductivity or chloride, blowdown vs. makeup',
  procedureRef: 'boiler-coc-monitoring',
  inputs: [
    { id: 'blowdownValue', label: 'Blowdown (conductivity or Cl-)' },
    { id: 'makeupValue', label: 'Makeup (conductivity or Cl-)' },
  ],
  compute({ blowdownValue, makeupValue }) {
    if (!(makeupValue > 0)) throw new Error('Makeup value must be greater than 0');
    const coc = blowdownValue / makeupValue;
    return { 'Cycles of Concentration': { value: coc, unit: 'cycles', decimals: 2 } };
  },
};
