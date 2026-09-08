export default {
  id: 'water-feed-pump-rate',
  domain: 'water',
  title: 'Chemical Feed Pump Rate',
  subtitle: 'Convert a required chemical mass feed to a pump feed rate',
  procedureRef: 'water-feed-pump-calibration',
  inputs: [
    { id: 'kgPerDay', label: 'Chemical Required', unit: 'kg/day' },
    { id: 'specificGravity', label: 'Product Specific Gravity', default: 1.0 },
    { id: 'purityPercent', label: 'Product Purity', unit: '%', default: 100 },
  ],
  compute({ kgPerDay, specificGravity, purityPercent }) {
    if (!(specificGravity > 0) || !(purityPercent > 0)) throw new Error('Specific gravity and purity must be greater than 0');
    // Specific gravity is relative to water (1 kg/L), so density in kg/L = SG
    const feedRateLpd = kgPerDay / (specificGravity * (purityPercent / 100));
    return {
      'Feed Rate': { value: feedRateLpd, unit: 'L/day' },
      'Feed Rate (per hour)': { value: feedRateLpd / 24, unit: 'L/h', decimals: 3 },
    };
  },
};
