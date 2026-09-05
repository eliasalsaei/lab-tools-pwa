export default {
  id: 'boiler-tds-conductivity',
  domain: 'boiler',
  title: 'Boiler Water TDS from Conductivity',
  subtitle: 'Estimate boiler water TDS from a conductivity reading',
  procedureRef: 'boiler-conductivity-sm2510b',
  inputs: [
    { id: 'conductivity', label: 'Conductivity', unit: 'µS/cm' },
    { id: 'factor', label: 'Conversion Factor', default: 0.7 },
  ],
  compute({ conductivity, factor }) {
    const tds = conductivity * factor;
    return { 'Estimated Boiler Water TDS': { value: tds, unit: 'mg/L' } };
  },
};
