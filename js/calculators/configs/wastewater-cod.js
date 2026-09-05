export default {
  id: 'wastewater-cod',
  domain: 'wastewater',
  title: 'COD',
  subtitle: 'Chemical oxygen demand from FAS titration',
  procedureRef: 'wastewater-cod-sm5220',
  inputs: [
    { id: 'blankTitrant', label: 'FAS Titrant — Blank (A)', unit: 'mL' },
    { id: 'sampleTitrant', label: 'FAS Titrant — Sample (B)', unit: 'mL' },
    { id: 'fasNormality', label: 'FAS Normality', unit: 'N', default: 0.1 },
    { id: 'sampleVolume', label: 'Sample Volume', unit: 'mL', default: 20 },
  ],
  compute({ blankTitrant, sampleTitrant, fasNormality, sampleVolume }) {
    if (!(sampleVolume > 0)) throw new Error('Sample volume must be greater than 0');
    const cod = ((blankTitrant - sampleTitrant) * fasNormality * 8000) / sampleVolume;
    return { COD: { value: cod, unit: 'mg/L' } };
  },
};
