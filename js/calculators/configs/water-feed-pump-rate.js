export default {
  id: 'water-feed-pump-rate',
  domain: 'water',
  title: 'Chemical Feed Pump Rate',
  subtitle: 'Convert a required chemical mass feed to a pump feed rate',
  procedureRef: 'water-feed-pump-calibration',
  inputs: [
    { id: 'lbsPerDay', label: 'Chemical Required', unit: 'lbs/day' },
    { id: 'specificGravity', label: 'Product Specific Gravity', default: 1.0 },
    { id: 'purityPercent', label: 'Product Purity', unit: '%', default: 100 },
  ],
  compute({ lbsPerDay, specificGravity, purityPercent }) {
    if (!(specificGravity > 0) || !(purityPercent > 0)) throw new Error('Specific gravity and purity must be greater than 0');
    const feedRateGpd = lbsPerDay / (8.34 * specificGravity * (purityPercent / 100));
    return { 'Feed Rate': { value: feedRateGpd, unit: 'gal/day' } };
  },
};
