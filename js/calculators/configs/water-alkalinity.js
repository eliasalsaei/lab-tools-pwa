export default {
  id: 'water-alkalinity',
  domain: 'water',
  title: 'Total Alkalinity (Titration)',
  subtitle: 'From sulfuric acid titration to pH 4.5',
  procedureRef: 'water-alkalinity-sm2320b',
  inputs: [
    { id: 'volSample', label: 'Sample Volume', unit: 'mL', default: 100 },
    { id: 'volTitrant', label: 'Titrant Volume Used', unit: 'mL' },
    { id: 'normality', label: 'Titrant Normality', unit: 'N', default: 0.02 },
  ],
  compute({ volSample, volTitrant, normality }) {
    if (!(volSample > 0)) throw new Error('Sample volume must be greater than 0');
    const mgL = (volTitrant * normality * 50000) / volSample;
    return { 'Total Alkalinity': { value: mgL, unit: 'mg/L as CaCO3' } };
  },
};
