export default {
  id: 'wastewater-svi',
  domain: 'wastewater',
  title: 'Sludge Volume Index (SVI)',
  subtitle: '30-minute settled sludge volume vs. MLSS',
  procedureRef: 'wastewater-svi-sm2710d',
  inputs: [
    { id: 'ssv30', label: '30-Minute Settled Sludge Volume', unit: 'mL/L' },
    { id: 'mlss', label: 'MLSS', unit: 'mg/L' },
  ],
  compute({ ssv30, mlss }) {
    if (!(mlss > 0)) throw new Error('MLSS must be greater than 0');
    const svi = (ssv30 * 1000) / mlss;
    return { SVI: { value: svi, unit: 'mL/g' } };
  },
};
