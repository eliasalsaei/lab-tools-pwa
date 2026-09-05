export default {
  id: 'water-chlorine-residual',
  domain: 'water',
  title: 'Chlorine Residual (Dilution Correction)',
  subtitle: 'Corrects DPD colorimeter reading for sample dilution',
  procedureRef: 'water-chlorine-dpd',
  inputs: [
    { id: 'instrumentReading', label: 'Instrument Reading', unit: 'mg/L' },
    { id: 'dilutionFactor', label: 'Dilution Factor', default: 1 },
  ],
  compute({ instrumentReading, dilutionFactor }) {
    const actual = instrumentReading * dilutionFactor;
    return { 'Chlorine Residual': { value: actual, unit: 'mg/L Cl2' } };
  },
};
