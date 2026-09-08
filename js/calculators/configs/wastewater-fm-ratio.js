export default {
  id: 'wastewater-fm-ratio',
  domain: 'wastewater',
  title: 'F/M Ratio',
  subtitle: 'Food-to-microorganism ratio for the aeration basin',
  procedureRef: 'wastewater-bod5-sm5210b',
  inputs: [
    { id: 'flow', label: 'Plant Flow', unit: 'm³/day' },
    { id: 'bod', label: 'Influent BOD', unit: 'mg/L' },
    { id: 'aerationVolume', label: 'Aeration Basin Volume', unit: 'm³' },
    { id: 'mlvss', label: 'MLVSS', unit: 'mg/L' },
  ],
  compute({ flow, bod, aerationVolume, mlvss }) {
    // 1 mg/L = 1 g/m³ throughout, so units cancel without conversion factors
    const massKg = (aerationVolume * mlvss) / 1000;
    if (!(massKg > 0)) throw new Error('Aeration volume and MLVSS must be greater than 0');
    const foodKgPerDay = (flow * bod) / 1000;
    const fm = foodKgPerDay / massKg;
    return {
      'F/M Ratio': { value: fm, unit: 'kg BOD/kg MLVSS/day', decimals: 3 },
      'BOD Load': { value: foodKgPerDay, unit: 'kg/day' },
      'MLVSS Mass': { value: massKg, unit: 'kg' },
    };
  },
};
