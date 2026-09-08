export default {
  id: 'boiler-silica-carryover',
  domain: 'boiler',
  title: 'Silica Carryover Check',
  subtitle: 'Boiler water silica vs. maximum allowed for operating pressure',
  procedureRef: 'boiler-silica-hach-8185',
  inputs: [
    { id: 'boilerWaterSilica', label: 'Boiler Water Silica (as SiO2)', unit: 'mg/L' },
    { id: 'maxAllowedSilica', label: 'Max Allowed Silica (per pressure chart)', unit: 'mg/L' },
  ],
  compute({ boilerWaterSilica, maxAllowedSilica }) {
    if (!(maxAllowedSilica > 0)) throw new Error('Max allowed silica must be greater than 0');
    const pctOfLimit = (boilerWaterSilica / maxAllowedSilica) * 100;
    const margin = maxAllowedSilica - boilerWaterSilica;
    return {
      'Percent of Silica Limit Used': { value: pctOfLimit, unit: '%' },
      'Margin to Limit': { value: margin, unit: 'mg/L' },
    };
  },
};
