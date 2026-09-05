export default {
  id: 'boiler-silica-carryover',
  domain: 'boiler',
  title: 'Silica Carryover Check',
  subtitle: 'Boiler water silica vs. maximum allowed for operating pressure',
  procedureRef: 'boiler-silica-sm4500sio2',
  inputs: [
    { id: 'boilerWaterSilica', label: 'Boiler Water Silica', unit: 'ppm' },
    { id: 'maxAllowedSilica', label: 'Max Allowed Silica (per pressure chart)', unit: 'ppm' },
  ],
  compute({ boilerWaterSilica, maxAllowedSilica }) {
    if (!(maxAllowedSilica > 0)) throw new Error('Max allowed silica must be greater than 0');
    const pctOfLimit = (boilerWaterSilica / maxAllowedSilica) * 100;
    return { 'Percent of Silica Limit Used': { value: pctOfLimit, unit: '%' } };
  },
};
