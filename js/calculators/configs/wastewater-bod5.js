export default {
  id: 'wastewater-bod5',
  domain: 'wastewater',
  title: 'BOD5',
  subtitle: '5-day biochemical oxygen demand with seed correction',
  procedureRef: 'wastewater-bod5-sm5210b',
  inputs: [
    { id: 'doInitialSample', label: 'DO Initial — Sample (D1)', unit: 'mg/L' },
    { id: 'doFinalSample', label: 'DO Final — Sample (D2)', unit: 'mg/L' },
    { id: 'doInitialBlank', label: 'DO Initial — Seed Blank (B1)', unit: 'mg/L', default: 0 },
    { id: 'doFinalBlank', label: 'DO Final — Seed Blank (B2)', unit: 'mg/L', default: 0 },
    { id: 'seedCorrectionFactor', label: 'Seed Correction Factor (f)', default: 1 },
    { id: 'dilutionFraction', label: 'Decimal Dilution Fraction (P)', default: 0.02 },
  ],
  compute({ doInitialSample, doFinalSample, doInitialBlank, doFinalBlank, seedCorrectionFactor, dilutionFraction }) {
    if (!(dilutionFraction > 0)) throw new Error('Dilution fraction must be greater than 0');
    const bod = ((doInitialSample - doFinalSample) - (doInitialBlank - doFinalBlank) * seedCorrectionFactor) / dilutionFraction;
    return { BOD5: { value: bod, unit: 'mg/L' } };
  },
};
