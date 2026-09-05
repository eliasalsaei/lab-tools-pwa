export default {
  id: 'boiler-condensate-return',
  domain: 'boiler',
  title: 'Condensate Return %',
  subtitle: 'Condensate flow as a percentage of feedwater flow',
  procedureRef: 'boiler-feedwater-condensate-sampling',
  inputs: [
    { id: 'condensateFlow', label: 'Condensate Flow', unit: 'gpm' },
    { id: 'feedwaterFlow', label: 'Feedwater Flow', unit: 'gpm' },
  ],
  compute({ condensateFlow, feedwaterFlow }) {
    if (!(feedwaterFlow > 0)) throw new Error('Feedwater flow must be greater than 0');
    const pct = (condensateFlow / feedwaterFlow) * 100;
    return { '% Condensate Return': { value: pct, unit: '%' } };
  },
};
