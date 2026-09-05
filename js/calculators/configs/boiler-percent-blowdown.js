export default {
  id: 'boiler-percent-blowdown',
  domain: 'boiler',
  title: 'Boiler % Blowdown',
  subtitle: 'From feedwater TDS and maximum allowed boiler water TDS',
  procedureRef: 'boiler-blowdown-sampling',
  inputs: [
    { id: 'feedwaterTDS', label: 'Feedwater TDS', unit: 'mg/L' },
    { id: 'maxBoilerTDS', label: 'Max Allowed Boiler Water TDS', unit: 'mg/L' },
  ],
  compute({ feedwaterTDS, maxBoilerTDS }) {
    if (!(maxBoilerTDS > feedwaterTDS)) throw new Error('Max allowed boiler TDS must be greater than feedwater TDS');
    const pct = (feedwaterTDS / (maxBoilerTDS - feedwaterTDS)) * 100;
    return { '% Blowdown': { value: pct, unit: '%' } };
  },
};
