export default {
  id: 'wastewater-fm-ratio',
  domain: 'wastewater',
  title: 'F/M Ratio',
  subtitle: 'Food-to-microorganism ratio for the aeration basin',
  procedureRef: 'wastewater-mlss-mlvss-sm2540',
  inputs: [
    { id: 'flow', label: 'Plant Flow', unit: 'MGD' },
    { id: 'bod', label: 'Influent BOD', unit: 'mg/L' },
    { id: 'aerationVolume', label: 'Aeration Basin Volume', unit: 'MG' },
    { id: 'mlvss', label: 'MLVSS', unit: 'mg/L' },
  ],
  compute({ flow, bod, aerationVolume, mlvss }) {
    const massLbs = aerationVolume * mlvss * 8.34;
    if (!(massLbs > 0)) throw new Error('Aeration volume and MLVSS must be greater than 0');
    const foodLbs = flow * bod * 8.34;
    const fm = foodLbs / massLbs;
    return { 'F/M Ratio': { value: fm, unit: 'lb BOD/lb MLVSS/day', decimals: 3 } };
  },
};
