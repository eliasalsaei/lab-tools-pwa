export default {
  id: 'boiler-blowdown-rate',
  domain: 'boiler',
  title: 'Cooling Tower Blowdown Rate',
  subtitle: 'From evaporation rate and target cycles of concentration',
  procedureRef: 'boiler-blowdown-sampling',
  inputs: [
    { id: 'evaporationRate', label: 'Evaporation Rate', unit: 'gpm' },
    { id: 'coc', label: 'Target Cycles of Concentration' },
  ],
  compute({ evaporationRate, coc }) {
    if (!(coc > 1)) throw new Error('Cycles of concentration must be greater than 1');
    const blowdown = evaporationRate / (coc - 1);
    return { 'Blowdown Rate': { value: blowdown, unit: 'gpm' } };
  },
};
