export default {
  id: 'water-tds-conductivity',
  domain: 'water',
  title: 'TDS from Conductivity',
  subtitle: 'Estimate total dissolved solids from a conductivity reading',
  procedureRef: 'water-tds-sm2540c',
  inputs: [
    { id: 'conductivity', label: 'Conductivity', unit: 'µS/cm' },
    { id: 'factor', label: 'Conversion Factor', default: 0.65 },
  ],
  compute({ conductivity, factor }) {
    const tds = conductivity * factor;
    return { 'Estimated TDS': { value: tds, unit: 'mg/L' } };
  },
};
