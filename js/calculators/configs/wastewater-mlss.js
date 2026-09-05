export default {
  id: 'wastewater-mlss',
  domain: 'wastewater',
  title: 'MLSS / MLVSS',
  subtitle: 'Gravimetric mixed liquor suspended / volatile suspended solids',
  procedureRef: 'wastewater-mlss-mlvss-sm2540',
  inputs: [
    { id: 'filterWeight', label: 'Filter (Tare) Weight', unit: 'g' },
    { id: 'filterPlusResidueWeight', label: 'Filter + Dried Residue Weight', unit: 'g' },
    { id: 'filterPlusResidueAfterIgnition', label: 'Filter + Residue After Ignition (for MLVSS, optional)', unit: 'g' },
    { id: 'sampleVolume', label: 'Sample Volume', unit: 'mL', default: 50 },
  ],
  compute({ filterWeight, filterPlusResidueWeight, filterPlusResidueAfterIgnition, sampleVolume }) {
    if (!(sampleVolume > 0)) throw new Error('Sample volume must be greater than 0');
    const mlss = ((filterPlusResidueWeight - filterWeight) * 1000000) / sampleVolume;
    const result = { MLSS: { value: mlss, unit: 'mg/L' } };
    if (Number.isFinite(filterPlusResidueAfterIgnition) && filterPlusResidueAfterIgnition > 0) {
      const mlvss = ((filterPlusResidueWeight - filterPlusResidueAfterIgnition) * 1000000) / sampleVolume;
      result.MLVSS = { value: mlvss, unit: 'mg/L' };
    }
    return result;
  },
};
