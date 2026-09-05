export default {
  id: 'water-hardness',
  domain: 'water',
  title: 'Total / Calcium / Magnesium Hardness (EDTA)',
  subtitle: 'EDTA titration, calculates Ca, Mg, and total hardness',
  procedureRef: 'water-hardness-sm2340c',
  inputs: [
    { id: 'volSample', label: 'Sample Volume', unit: 'mL', default: 100 },
    { id: 'volTitrantTotal', label: 'EDTA Used — Total Hardness Titration', unit: 'mL' },
    { id: 'volTitrantCalcium', label: 'EDTA Used — Calcium Titration (murexide)', unit: 'mL' },
    { id: 'titerFactor', label: 'EDTA Titer', unit: 'mg CaCO3/mL', default: 1.0 },
  ],
  compute({ volSample, volTitrantTotal, volTitrantCalcium, titerFactor }) {
    if (!(volSample > 0)) throw new Error('Sample volume must be greater than 0');
    const totalHardness = (volTitrantTotal * titerFactor * 1000) / volSample;
    const calciumHardness = (volTitrantCalcium * titerFactor * 1000) / volSample;
    const magnesiumHardness = totalHardness - calciumHardness;
    return {
      'Total Hardness': { value: totalHardness, unit: 'mg/L as CaCO3' },
      'Calcium Hardness': { value: calciumHardness, unit: 'mg/L as CaCO3' },
      'Magnesium Hardness': { value: magnesiumHardness, unit: 'mg/L as CaCO3' },
    };
  },
};
